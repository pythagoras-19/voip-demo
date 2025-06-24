/**
 * SIP Transaction Manager
 * Handles transaction state machines for reliable message delivery
 * 
 * Transaction Types:
 * - Client Transaction (for requests)
 * - Server Transaction (for responses)
 */

import { EventEmitter } from 'events';
import { SIPMethods, SIPStatusCodes } from './sip-message.js';

export class SIPTransaction extends EventEmitter {
  constructor(message, isClient = true) {
    super();
    this.message = message;
    this.isClient = isClient;
    this.state = isClient ? 'calling' : 'proceeding';
    this.timerA = null;
    this.timerB = null;
    this.timerD = null;
    this.timerF = null;
    this.timerK = null;
    this.retransmitCount = 0;
    this.maxRetransmits = 10;
    this.branch = this.generateBranch();
  }

  /**
   * Generate a unique branch parameter
   */
  generateBranch() {
    return 'z9hG4bK' + Math.random().toString(36).substr(2, 9);
  }

  /**
   * Start the transaction
   */
  start() {
    if (this.isClient) {
      this.startClientTransaction();
    } else {
      this.startServerTransaction();
    }
  }

  /**
   * Start client transaction state machine
   */
  startClientTransaction() {
    switch (this.message.method) {
      case SIPMethods.INVITE:
        this.startInviteClientTransaction();
        break;
      case SIPMethods.NON_INVITE:
        this.startNonInviteClientTransaction();
        break;
      default:
        this.startNonInviteClientTransaction();
    }
  }

  /**
   * Start INVITE client transaction
   */
  startInviteClientTransaction() {
    this.state = 'calling';
    
    // Start timer A (retransmit timer)
    this.timerA = setTimeout(() => {
      this.retransmit();
    }, 500); // 500ms initial timeout

    // Start timer B (timeout timer)
    this.timerB = setTimeout(() => {
      this.timeout();
    }, 32000); // 32 seconds timeout

    this.emit('stateChanged', this.state);
  }

  /**
   * Start non-INVITE client transaction
   */
  startNonInviteClientTransaction() {
    this.state = 'trying';
    
    // Start timer F (timeout timer)
    this.timerF = setTimeout(() => {
      this.timeout();
    }, 32000); // 32 seconds timeout

    this.emit('stateChanged', this.state);
  }

  /**
   * Start server transaction state machine
   */
  startServerTransaction() {
    this.state = 'proceeding';
    this.emit('stateChanged', this.state);
  }

  /**
   * Handle incoming response (client transaction)
   */
  handleResponse(response) {
    if (!this.isClient) return;

    const statusCode = response.statusCode;
    
    if (statusCode >= 100 && statusCode < 200) {
      // Provisional response
      if (this.state === 'calling') {
        this.state = 'proceeding';
        this.emit('stateChanged', this.state);
      }
      this.emit('provisional', response);
    } else if (statusCode >= 200 && statusCode < 300) {
      // Success response
      this.state = 'terminated';
      this.clearTimers();
      this.emit('success', response);
      this.emit('stateChanged', this.state);
    } else if (statusCode >= 300 && statusCode < 700) {
      // Error response
      this.state = 'terminated';
      this.clearTimers();
      this.emit('error', response);
      this.emit('stateChanged', this.state);
    }
  }

  /**
   * Handle incoming request (server transaction)
   */
  handleRequest(request) {
    if (this.isClient) return;

    // Update state based on request
    if (request.method === SIPMethods.ACK) {
      this.state = 'confirmed';
      this.emit('stateChanged', this.state);
      
      // Start timer I for confirmed state
      this.timerI = setTimeout(() => {
        this.state = 'terminated';
        this.emit('stateChanged', this.state);
      }, 32000);
    } else if (request.method === SIPMethods.CANCEL) {
      this.state = 'cancelled';
      this.emit('stateChanged', this.state);
    }
  }

  /**
   * Retransmit the request
   */
  retransmit() {
    if (this.retransmitCount >= this.maxRetransmits) {
      this.timeout();
      return;
    }

    this.retransmitCount++;
    this.emit('retransmit', this.message);
    
    // Exponential backoff
    const timeout = Math.min(500 * Math.pow(2, this.retransmitCount), 4000);
    this.timerA = setTimeout(() => {
      this.retransmit();
    }, timeout);
  }

  /**
   * Handle timeout
   */
  timeout() {
    this.state = 'terminated';
    this.clearTimers();
    this.emit('timeout');
    this.emit('stateChanged', this.state);
  }

  /**
   * Clear all timers
   */
  clearTimers() {
    if (this.timerA) {
      clearTimeout(this.timerA);
      this.timerA = null;
    }
    if (this.timerB) {
      clearTimeout(this.timerB);
      this.timerB = null;
    }
    if (this.timerD) {
      clearTimeout(this.timerD);
      this.timerD = null;
    }
    if (this.timerF) {
      clearTimeout(this.timerF);
      this.timerF = null;
    }
    if (this.timerK) {
      clearTimeout(this.timerK);
      this.timerK = null;
    }
    if (this.timerI) {
      clearTimeout(this.timerI);
      this.timerI = null;
    }
  }

  /**
   * Get transaction key for matching
   */
  getKey() {
    const cseq = this.message.getCSeq();
    const callId = this.message.getCallId();
    const from = this.message.getHeader('from');
    
    return `${this.branch}-${callId}-${cseq?.sequence}-${from}`;
  }

  /**
   * Check if transaction is terminated
   */
  isTerminated() {
    return this.state === 'terminated';
  }

  /**
   * Destroy the transaction
   */
  destroy() {
    this.clearTimers();
    this.removeAllListeners();
  }
}

/**
 * Transaction Manager
 * Manages multiple transactions
 */
export class TransactionManager extends EventEmitter {
  constructor() {
    super();
    this.transactions = new Map();
    this.clientTransactions = new Map();
    this.serverTransactions = new Map();
  }

  /**
   * Create a new client transaction
   */
  createClientTransaction(message) {
    const transaction = new SIPTransaction(message, true);
    const key = transaction.getKey();
    
    this.clientTransactions.set(key, transaction);
    this.transactions.set(key, transaction);
    
    transaction.on('stateChanged', (state) => {
      this.emit('transactionStateChanged', { key, state, isClient: true });
    });
    
    transaction.on('terminated', () => {
      this.removeTransaction(key);
    });
    
    return transaction;
  }

  /**
   * Create a new server transaction
   */
  createServerTransaction(message) {
    const transaction = new SIPTransaction(message, false);
    const key = transaction.getKey();
    
    this.serverTransactions.set(key, transaction);
    this.transactions.set(key, transaction);
    
    transaction.on('stateChanged', (state) => {
      this.emit('transactionStateChanged', { key, state, isClient: false });
    });
    
    transaction.on('terminated', () => {
      this.removeTransaction(key);
    });
    
    return transaction;
  }

  /**
   * Find transaction by key
   */
  findTransaction(key) {
    return this.transactions.get(key);
  }

  /**
   * Find client transaction by key
   */
  findClientTransaction(key) {
    return this.clientTransactions.get(key);
  }

  /**
   * Find server transaction by key
   */
  findServerTransaction(key) {
    return this.serverTransactions.get(key);
  }

  /**
   * Remove transaction
   */
  removeTransaction(key) {
    const transaction = this.transactions.get(key);
    if (transaction) {
      transaction.destroy();
      this.transactions.delete(key);
      this.clientTransactions.delete(key);
      this.serverTransactions.delete(key);
    }
  }

  /**
   * Get all active transactions
   */
  getActiveTransactions() {
    return Array.from(this.transactions.values());
  }

  /**
   * Get transaction statistics
   */
  getStats() {
    return {
      total: this.transactions.size,
      client: this.clientTransactions.size,
      server: this.serverTransactions.size
    };
  }

  /**
   * Clean up terminated transactions
   */
  cleanup() {
    for (const [key, transaction] of this.transactions) {
      if (transaction.isTerminated()) {
        this.removeTransaction(key);
      }
    }
  }

  /**
   * Destroy all transactions
   */
  destroy() {
    for (const transaction of this.transactions.values()) {
      transaction.destroy();
    }
    this.transactions.clear();
    this.clientTransactions.clear();
    this.serverTransactions.clear();
    this.removeAllListeners();
  }
} 
/**
 * SIP Debugger Tool
 * Visualizes SIP message flows for learning purposes
 */

import { EventEmitter } from 'events';
import { SIPMessage, SIPMethods, SIPStatusCodes } from '../src/sip/sip-message.js';
import { UDPTransport } from '../src/network/udp-transport.js';

export class SIPDebugger extends EventEmitter {
  constructor(options = {}) {
    super();
    this.port = options.port || 5062;
    this.transport = new UDPTransport({
      host: '0.0.0.0',
      sipPort: this.port
    });
    
    this.messageLog = [];
    this.maxLogSize = 1000;
    this.isRunning = false;
    
    this.setupEventHandlers();
  }

  /**
   * Set up event handlers
   */
  setupEventHandlers() {
    this.transport.on('sipMessage', (message, rinfo) => {
      this.logMessage(message, rinfo, 'received');
    });
    
    this.transport.on('bound', () => {
      console.log(`SIP Debugger listening on port ${this.port}`);
    });
  }

  /**
   * Start the debugger
   */
  async start() {
    try {
      await this.transport.bind();
      this.isRunning = true;
      console.log('SIP Debugger started');
    } catch (error) {
      console.error('Failed to start SIP debugger:', error);
      throw error;
    }
  }

  /**
   * Stop the debugger
   */
  stop() {
    this.transport.close();
    this.isRunning = false;
    console.log('SIP Debugger stopped');
  }

  /**
   * Log a SIP message
   */
  logMessage(message, rinfo, direction) {
    const logEntry = {
      timestamp: new Date(),
      direction,
      method: message.method || `${message.statusCode} ${message.reasonPhrase}`,
      from: message.getHeader('from'),
      to: message.getHeader('to'),
      callId: message.getCallId(),
      cseq: message.getCSeq(),
      source: `${rinfo.address}:${rinfo.port}`,
      message: message.toString(),
      size: message.toString().length
    };
    
    this.messageLog.push(logEntry);
    
    // Keep log size manageable
    if (this.messageLog.length > this.maxLogSize) {
      this.messageLog.shift();
    }
    
    this.displayMessage(logEntry);
  }

  /**
   * Display a message in a formatted way
   */
  displayMessage(logEntry) {
    const { timestamp, direction, method, from, to, callId, source, size } = logEntry;
    
    console.log('\n' + '='.repeat(80));
    console.log(`${timestamp.toISOString()} | ${direction.toUpperCase()} | ${method}`);
    console.log(`From: ${from}`);
    console.log(`To: ${to}`);
    console.log(`Call-ID: ${callId}`);
    console.log(`Source: ${source}`);
    console.log(`Size: ${size} bytes`);
    console.log('-'.repeat(80));
    
    // Show message content (truncated for readability)
    const content = logEntry.message.length > 500 
      ? logEntry.message.substring(0, 500) + '...'
      : logEntry.message;
    console.log(content);
    console.log('='.repeat(80));
  }

  /**
   * Get message statistics
   */
  getStats() {
    const stats = {
      totalMessages: this.messageLog.length,
      requests: 0,
      responses: 0,
      methods: {},
      statusCodes: {},
      callFlows: new Map()
    };
    
    for (const entry of this.messageLog) {
      if (entry.method.includes(' ')) {
        // Response
        stats.responses++;
        const statusCode = parseInt(entry.method.split(' ')[0]);
        stats.statusCodes[statusCode] = (stats.statusCodes[statusCode] || 0) + 1;
      } else {
        // Request
        stats.requests++;
        stats.methods[entry.method] = (stats.methods[entry.method] || 0) + 1;
      }
      
      // Track call flows
      if (entry.callId) {
        if (!stats.callFlows.has(entry.callId)) {
          stats.callFlows.set(entry.callId, []);
        }
        stats.callFlows.get(entry.callId).push(entry);
      }
    }
    
    return stats;
  }

  /**
   * Display call flow for a specific call
   */
  displayCallFlow(callId) {
    const callMessages = this.messageLog.filter(entry => entry.callId === callId);
    
    if (callMessages.length === 0) {
      console.log(`No messages found for Call-ID: ${callId}`);
      return;
    }
    
    console.log(`\nCall Flow for Call-ID: ${callId}`);
    console.log('='.repeat(60));
    
    // Sort by timestamp
    callMessages.sort((a, b) => a.timestamp - b.timestamp);
    
    for (const message of callMessages) {
      const time = message.timestamp.toISOString().split('T')[1].split('.')[0];
      const arrow = message.direction === 'received' ? '←' : '→';
      console.log(`${time} ${arrow} ${message.method} (${message.source})`);
    }
    
    console.log('='.repeat(60));
  }

  /**
   * Display summary statistics
   */
  displayStats() {
    const stats = this.getStats();
    
    console.log('\nSIP Debugger Statistics');
    console.log('='.repeat(40));
    console.log(`Total Messages: ${stats.totalMessages}`);
    console.log(`Requests: ${stats.requests}`);
    console.log(`Responses: ${stats.responses}`);
    
    console.log('\nMethods:');
    for (const [method, count] of Object.entries(stats.methods)) {
      console.log(`  ${method}: ${count}`);
    }
    
    console.log('\nStatus Codes:');
    for (const [code, count] of Object.entries(stats.statusCodes)) {
      const reason = SIPStatusCodes[code] || 'Unknown';
      console.log(`  ${code} ${reason}: ${count}`);
    }
    
    console.log(`\nActive Call Flows: ${stats.callFlows.size}`);
    console.log('='.repeat(40));
  }

  /**
   * Clear message log
   */
  clearLog() {
    this.messageLog = [];
    console.log('Message log cleared');
  }

  /**
   * Export log to file
   */
  exportLog(filename) {
    const fs = require('fs');
    const data = JSON.stringify(this.messageLog, null, 2);
    
    fs.writeFileSync(filename, data);
    console.log(`Log exported to ${filename}`);
  }

  /**
   * Filter messages by criteria
   */
  filterMessages(criteria = {}) {
    return this.messageLog.filter(entry => {
      if (criteria.method && !entry.method.includes(criteria.method)) {
        return false;
      }
      if (criteria.direction && entry.direction !== criteria.direction) {
        return false;
      }
      if (criteria.callId && entry.callId !== criteria.callId) {
        return false;
      }
      if (criteria.from && !entry.from.includes(criteria.from)) {
        return false;
      }
      if (criteria.to && !entry.to.includes(criteria.to)) {
        return false;
      }
      return true;
    });
  }

  /**
   * Generate call flow diagram
   */
  generateCallFlowDiagram(callId) {
    const callMessages = this.messageLog.filter(entry => entry.callId === callId);
    
    if (callMessages.length === 0) {
      return 'No messages found for this call';
    }
    
    // Sort by timestamp
    callMessages.sort((a, b) => a.timestamp - b.timestamp);
    
    let diagram = `Call Flow Diagram for Call-ID: ${callId}\n`;
    diagram += '='.repeat(60) + '\n\n';
    
    let clientSide = 'Client';
    let serverSide = 'Server';
    
    for (const message of callMessages) {
      const time = message.timestamp.toISOString().split('T')[1].split('.')[0];
      const method = message.method;
      
      if (message.direction === 'received') {
        diagram += `${time} ${clientSide} ← ${method} ← ${serverSide}\n`;
      } else {
        diagram += `${time} ${clientSide} → ${method} → ${serverSide}\n`;
      }
    }
    
    return diagram;
  }
}

// Example usage
async function runSIPDebugger() {
  const sipDebugger = new SIPDebugger({ port: 5062 });
  
  try {
    await sipDebugger.start();
    
    // Display stats every 30 seconds
    setInterval(() => {
      sipDebugger.displayStats();
    }, 30000);
    
    console.log('SIP Debugger running. Press Ctrl+C to stop.');
    
    // Keep running
    process.on('SIGINT', () => {
      sipDebugger.stop();
      process.exit(0);
    });
    
  } catch (error) {
    console.error('SIP Debugger error:', error);
  }
}

// Export the debugger class and example
export default SIPDebugger;
export { runSIPDebugger }; 
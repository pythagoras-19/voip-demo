/**
 * VoIP Server
 * Main server that integrates SIP, RTP, and network components
 */

import { EventEmitter } from 'events';
import { SIPMessage, SIPMethods, SIPStatusCodes } from './sip/sip-message.js';
import { TransactionManager } from './sip/sip-transaction.js';
import { RTPSession } from './rtp/rtp-session.js';
import { UDPTransport } from './network/udp-transport.js';
import { G711Codec } from './codecs/g711.js';

export class VoIPServer extends EventEmitter {
  constructor(options = {}) {
    super();
    
    this.options = {
      host: options.host || '0.0.0.0',
      sipPort: options.sipPort || 5060,
      rtpPort: options.rtpPort || 10000,
      ...options
    };
    
    // Core components
    this.transport = new UDPTransport(this.options);
    this.transactionManager = new TransactionManager();
    
    // User agent state
    this.registeredUsers = new Map();
    this.activeCalls = new Map();
    this.rtpSessions = new Map();
    
    // Codec support
    this.codecs = {
      'PCMU': new G711Codec('mulaw'),
      'PCMA': new G711Codec('alaw')
    };
    
    // Statistics
    this.stats = {
      callsReceived: 0,
      callsCompleted: 0,
      callsFailed: 0,
      registrations: 0,
      startTime: Date.now()
    };
    
    this.isRunning = false;
  }

  /**
   * Start the VoIP server
   */
  async start() {
    try {
      console.log('Starting VoIP Server...');
      
      // Bind transport
      await this.transport.bind();
      
      // Set up event handlers
      this.setupEventHandlers();
      
      this.isRunning = true;
      console.log('VoIP Server started successfully');
      this.emit('started');
      
    } catch (error) {
      console.error('Failed to start VoIP server:', error);
      this.emit('error', error);
      throw error;
    }
  }

  /**
   * Stop the VoIP server
   */
  stop() {
    console.log('Stopping VoIP Server...');
    
    this.isRunning = false;
    
    // Close all active calls
    for (const call of this.activeCalls.values()) {
      this.terminateCall(call.callId);
    }
    
    // Close transport
    this.transport.close();
    
    console.log('VoIP Server stopped');
    this.emit('stopped');
  }

  /**
   * Set up event handlers
   */
  setupEventHandlers() {
    // SIP message handling
    this.transport.on('sipMessage', (message, rinfo) => {
      this.handleSIPMessage(message, rinfo);
    });
    
    // RTP data handling
    this.transport.on('rtpData', (data, rinfo) => {
      this.handleRTPData(data, rinfo);
    });
    
    // Transport events
    this.transport.on('error', (error) => {
      console.error('Transport error:', error);
      this.emit('error', error);
    });
    
    // Transaction events
    this.transactionManager.on('transactionStateChanged', (info) => {
      console.log(`Transaction state changed: ${info.key} -> ${info.state}`);
    });
  }

  /**
   * Handle incoming SIP message
   */
  handleSIPMessage(message, rinfo) {
    console.log(`Received SIP ${message.method || message.statusCode} from ${rinfo.address}:${rinfo.port}`);
    
    if (message.isRequest()) {
      this.handleSIPRequest(message, rinfo);
    } else {
      this.handleSIPResponse(message, rinfo);
    }
  }

  /**
   * Handle SIP request
   */
  handleSIPRequest(request, rinfo) {
    switch (request.method) {
      case SIPMethods.REGISTER:
        this.handleRegister(request, rinfo);
        break;
      case SIPMethods.INVITE:
        this.handleInvite(request, rinfo);
        break;
      case SIPMethods.ACK:
        this.handleAck(request, rinfo);
        break;
      case SIPMethods.BYE:
        this.handleBye(request, rinfo);
        break;
      case SIPMethods.CANCEL:
        this.handleCancel(request, rinfo);
        break;
      case SIPMethods.OPTIONS:
        this.handleOptions(request, rinfo);
        break;
      default:
        this.sendResponse(request, 501, 'Not Implemented', rinfo);
    }
  }

  /**
   * Handle SIP response
   */
  handleSIPResponse(response, rinfo) {
    // Find matching transaction
    const callId = response.getCallId();
    const cseq = response.getCSeq();
    
    if (callId && cseq) {
      const transaction = this.transactionManager.findClientTransaction(`${callId}-${cseq.sequence}`);
      if (transaction) {
        transaction.handleResponse(response);
      }
    }
  }

  /**
   * Handle REGISTER request
   */
  handleRegister(request, rinfo) {
    const from = request.getHeader('from');
    const contact = request.getHeader('contact');
    const expires = request.getHeader('expires') || '3600';
    
    if (!from || !contact) {
      this.sendResponse(request, 400, 'Bad Request', rinfo);
      return;
    }
    
    // Extract user info
    const userMatch = from.match(/sip:([^@]+)@/);
    if (!userMatch) {
      this.sendResponse(request, 400, 'Bad Request', rinfo);
      return;
    }
    
    const username = userMatch[1];
    const userInfo = {
      username,
      contact,
      expires: parseInt(expires),
      registeredAt: Date.now(),
      address: rinfo.address,
      port: rinfo.port
    };
    
    this.registeredUsers.set(username, userInfo);
    this.stats.registrations++;
    
    console.log(`User registered: ${username} -> ${contact}`);
    
    // Send 200 OK
    const response = request.createResponse(200, 'OK');
    response.setHeader('contact', contact);
    response.setHeader('expires', expires);
    
    this.sendResponse(response, rinfo);
  }

  /**
   * Handle INVITE request
   */
  handleInvite(request, rinfo) {
    const from = request.getHeader('from');
    const to = request.getHeader('to');
    const callId = request.getCallId();
    
    if (!from || !to || !callId) {
      this.sendResponse(request, 400, 'Bad Request', rinfo);
      return;
    }
    
    // Extract target user
    const toMatch = to.match(/sip:([^@]+)@/);
    if (!toMatch) {
      this.sendResponse(request, 400, 'Bad Request', rinfo);
      return;
    }
    
    const targetUser = toMatch[1];
    const userInfo = this.registeredUsers.get(targetUser);
    
    if (!userInfo) {
      this.sendResponse(request, 404, 'Not Found', rinfo);
      return;
    }
    
    // Create call session
    const call = {
      callId,
      from,
      to,
      state: 'incoming',
      startTime: Date.now(),
      sdp: request.body
    };
    
    this.activeCalls.set(callId, call);
    this.stats.callsReceived++;
    
    console.log(`Incoming call from ${from} to ${targetUser}`);
    
    // Send 180 Ringing
    const ringing = request.createResponse(180, 'Ringing');
    this.sendResponse(ringing, rinfo);
    
    // Simulate call acceptance after 2 seconds
    setTimeout(() => {
      this.acceptCall(callId, rinfo);
    }, 2000);
  }

  /**
   * Accept incoming call
   */
  acceptCall(callId, rinfo) {
    const call = this.activeCalls.get(callId);
    if (!call || call.state !== 'incoming') {
      return;
    }
    
    call.state = 'accepted';
    
    // Create RTP session
    const rtpSession = new RTPSession({
      payloadType: 0, // PCMU
      clockRate: 8000
    });
    
    this.rtpSessions.set(callId, rtpSession);
    
    // Send 200 OK with SDP
    const response = this.createInviteResponse(call);
    this.sendResponse(response, rinfo);
    
    console.log(`Call ${callId} accepted`);
  }

  /**
   * Create INVITE response with SDP
   */
  createInviteResponse(call) {
    const response = new SIPMessage();
    response.version = 'SIP/2.0';
    response.statusCode = 200;
    response.reasonPhrase = 'OK';
    
    // Copy headers from original request
    response.setHeader('via', call.via);
    response.setHeader('from', call.from);
    response.setHeader('to', call.to);
    response.setHeader('call-id', call.callId);
    response.setHeader('cseq', call.cseq);
    
    // Add SDP body
    const sdp = this.generateSDP();
    response.setHeader('content-type', 'application/sdp');
    response.setHeader('content-length', sdp.length.toString());
    response.body = sdp;
    
    return response;
  }

  /**
   * Generate SDP for response
   */
  generateSDP() {
    const rtpPort = this.transport.getAvailableRTPPort();
    
    return `v=0
o=- 1234567890 1234567890 IN IP4 ${this.options.host}
s=VoIP Call
c=IN IP4 ${this.options.host}
t=0 0
m=audio ${rtpPort} RTP/AVP 0 8
a=rtpmap:0 PCMU/8000
a=rtpmap:8 PCMA/8000
a=ptime:20
a=maxptime:40`;
  }

  /**
   * Handle ACK request
   */
  handleAck(request, rinfo) {
    const callId = request.getCallId();
    const call = this.activeCalls.get(callId);
    
    if (call) {
      call.state = 'established';
      console.log(`Call ${callId} established`);
      
      // Start RTP session
      const rtpSession = this.rtpSessions.get(callId);
      if (rtpSession) {
        rtpSession.start();
      }
    }
  }

  /**
   * Handle BYE request
   */
  handleBye(request, rinfo) {
    const callId = request.getCallId();
    this.terminateCall(callId);
    
    const response = request.createResponse(200, 'OK');
    this.sendResponse(response, rinfo);
  }

  /**
   * Handle CANCEL request
   */
  handleCancel(request, rinfo) {
    const callId = request.getCallId();
    this.terminateCall(callId);
    
    const response = request.createResponse(200, 'OK');
    this.sendResponse(response, rinfo);
  }

  /**
   * Handle OPTIONS request
   */
  handleOptions(request, rinfo) {
    const response = request.createResponse(200, 'OK');
    response.setHeader('allow', 'INVITE, ACK, BYE, CANCEL, OPTIONS, REGISTER');
    response.setHeader('accept', 'application/sdp');
    
    this.sendResponse(response, rinfo);
  }

  /**
   * Terminate call
   */
  terminateCall(callId) {
    const call = this.activeCalls.get(callId);
    if (call) {
      call.state = 'terminated';
      call.endTime = Date.now();
      
      if (call.state === 'established') {
        this.stats.callsCompleted++;
      } else {
        this.stats.callsFailed++;
      }
      
      this.activeCalls.delete(callId);
      
      // Stop RTP session
      const rtpSession = this.rtpSessions.get(callId);
      if (rtpSession) {
        rtpSession.stop();
        this.rtpSessions.delete(callId);
      }
      
      console.log(`Call ${callId} terminated`);
    }
  }

  /**
   * Handle RTP data
   */
  handleRTPData(data, rinfo) {
    // Find matching RTP session
    for (const [callId, rtpSession] of this.rtpSessions) {
      if (rtpSession.isActive) {
        rtpSession.receivePacket(data);
        break;
      }
    }
  }

  /**
   * Send SIP response
   */
  sendResponse(response, rinfo) {
    this.transport.sendSIPMessage(response, rinfo.address, rinfo.port);
  }

  /**
   * Get server statistics
   */
  getStats() {
    const now = Date.now();
    const uptime = (now - this.stats.startTime) / 1000;
    
    return {
      ...this.stats,
      uptime,
      registeredUsers: this.registeredUsers.size,
      activeCalls: this.activeCalls.size,
      activeRTPSessions: this.rtpSessions.size,
      transport: this.transport.getStats(),
      transactions: this.transactionManager.getStats()
    };
  }

  /**
   * Get registered users
   */
  getRegisteredUsers() {
    return Array.from(this.registeredUsers.values());
  }

  /**
   * Get active calls
   */
  getActiveCalls() {
    return Array.from(this.activeCalls.values());
  }

  /**
   * Register a user programmatically
   */
  registerUser(username, contact, expires = 3600) {
    const userInfo = {
      username,
      contact,
      expires,
      registeredAt: Date.now(),
      address: '127.0.0.1',
      port: 5060
    };
    
    this.registeredUsers.set(username, userInfo);
    this.stats.registrations++;
    
    return userInfo;
  }

  /**
   * Unregister a user
   */
  unregisterUser(username) {
    const user = this.registeredUsers.get(username);
    if (user) {
      this.registeredUsers.delete(username);
      console.log(`User unregistered: ${username}`);
      return true;
    }
    return false;
  }
}

// Export the server class
export default VoIPServer; 
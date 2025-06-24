/**
 * VoIP Client Example
 * Demonstrates how to connect to the VoIP server and make calls
 */

import { SIPMessage, SIPMethods } from './sip/sip-message.js';
import { UDPTransport } from './network/udp-transport.js';
import { RTPSession } from './rtp/rtp-session.js';
import { G711Codec } from './codecs/g711.js';
import { v4 as uuidv4 } from 'uuid';
import { EventEmitter } from 'events';

export class VoIPClient extends EventEmitter {
  constructor(options = {}) {
    super();
    
    this.username = options.username || 'client';
    this.serverHost = options.serverHost || '127.0.0.1';
    this.serverPort = options.serverPort || 5060;
    this.localPort = options.localPort || 5061;
    
    this.transport = new UDPTransport({
      host: '0.0.0.0',
      sipPort: this.localPort,
      rtpPort: 10001
    });
    
    this.registered = false;
    this.activeCall = null;
    this.rtpSession = null;
    this.codec = new G711Codec('mulaw');
    
    this.setupEventHandlers();
  }

  /**
   * Set up event handlers
   */
  setupEventHandlers() {
    this.transport.on('sipMessage', (message, rinfo) => {
      this.handleSIPMessage(message, rinfo);
    });
    
    this.transport.on('rtpData', (data, rinfo) => {
      this.handleRTPData(data, rinfo);
    });
    
    this.transport.on('bound', () => {
      console.log('Client transport bound');
    });
    
    this.transport.on('error', (error) => {
      console.error('Client transport error:', error);
    });
  }

  /**
   * Start the client
   */
  async start() {
    try {
      await this.transport.bind();
      console.log(`VoIP Client started on port ${this.localPort}`);
      this.emit('started');
    } catch (error) {
      console.error('Failed to start client:', error);
      throw error;
    }
  }

  /**
   * Stop the client
   */
  stop() {
    if (this.activeCall) {
      this.hangup();
    }
    
    this.transport.close();
    console.log('VoIP Client stopped');
    this.emit('stopped');
  }

  /**
   * Register with the server
   */
  register() {
    const message = new SIPMessage();
    message.method = SIPMethods.REGISTER;
    message.uri = `sip:${this.serverHost}:${this.serverPort}`;
    message.version = 'SIP/2.0';
    
    const callId = uuidv4();
    const cseq = 1;
    
    message.setHeader('via', `SIP/2.0/UDP ${this.transport.host}:${this.localPort};branch=z9hG4bK${Math.random().toString(36).substr(2, 9)}`);
    message.setHeader('from', `sip:${this.username}@${this.serverHost};tag=${Math.random().toString(36).substr(2, 8)}`);
    message.setHeader('to', `sip:${this.username}@${this.serverHost}`);
    message.setHeader('call-id', callId);
    message.setHeader('cseq', `${cseq} REGISTER`);
    message.setHeader('contact', `sip:${this.username}@${this.transport.host}:${this.localPort}`);
    message.setHeader('expires', '3600');
    message.setHeader('user-agent', 'VoIP-Learning-Client/1.0');
    message.setHeader('content-length', '0');
    
    this.transport.sendSIPMessage(message, this.serverHost, this.serverPort);
    console.log(`Registering as ${this.username}...`);
  }

  /**
   * Make a call
   */
  call(targetUser) {
    if (this.activeCall) {
      console.log('Already in a call');
      return;
    }
    
    const message = new SIPMessage();
    message.method = SIPMethods.INVITE;
    message.uri = `sip:${targetUser}@${this.serverHost}:${this.serverPort}`;
    message.version = 'SIP/2.0';
    
    const callId = uuidv4();
    const cseq = 1;
    
    message.setHeader('via', `SIP/2.0/UDP ${this.transport.host}:${this.localPort};branch=z9hG4bK${Math.random().toString(36).substr(2, 9)}`);
    message.setHeader('from', `sip:${this.username}@${this.serverHost};tag=${Math.random().toString(36).substr(2, 8)}`);
    message.setHeader('to', `sip:${targetUser}@${this.serverHost}`);
    message.setHeader('call-id', callId);
    message.setHeader('cseq', `${cseq} INVITE`);
    message.setHeader('contact', `sip:${this.username}@${this.transport.host}:${this.localPort}`);
    message.setHeader('user-agent', 'VoIP-Learning-Client/1.0');
    message.setHeader('content-type', 'application/sdp');
    
    // Generate SDP
    const sdp = this.generateSDP();
    message.setHeader('content-length', sdp.length.toString());
    message.body = sdp;
    
    this.activeCall = {
      callId,
      targetUser,
      state: 'calling',
      startTime: Date.now()
    };
    
    this.transport.sendSIPMessage(message, this.serverHost, this.serverPort);
    console.log(`Calling ${targetUser}...`);
  }

  /**
   * Generate SDP for INVITE
   */
  generateSDP() {
    const rtpPort = this.transport.getAvailableRTPPort();
    
    return `v=0
o=${this.username} 1234567890 1234567890 IN IP4 ${this.transport.host}
s=VoIP Call
c=IN IP4 ${this.transport.host}
t=0 0
m=audio ${rtpPort} RTP/AVP 0 8
a=rtpmap:0 PCMU/8000
a=rtpmap:8 PCMA/8000
a=ptime:20
a=maxptime:40`;
  }

  /**
   * Hang up current call
   */
  hangup() {
    if (!this.activeCall) {
      console.log('No active call to hang up');
      return;
    }
    
    const message = new SIPMessage();
    message.method = SIPMethods.BYE;
    message.uri = `sip:${this.activeCall.targetUser}@${this.serverHost}:${this.serverPort}`;
    message.version = 'SIP/2.0';
    
    message.setHeader('via', `SIP/2.0/UDP ${this.transport.host}:${this.localPort};branch=z9hG4bK${Math.random().toString(36).substr(2, 9)}`);
    message.setHeader('from', `sip:${this.username}@${this.serverHost};tag=${Math.random().toString(36).substr(2, 8)}`);
    message.setHeader('to', `sip:${this.activeCall.targetUser}@${this.serverHost}`);
    message.setHeader('call-id', this.activeCall.callId);
    message.setHeader('cseq', `2 BYE`);
    message.setHeader('user-agent', 'VoIP-Learning-Client/1.0');
    message.setHeader('content-length', '0');
    
    this.transport.sendSIPMessage(message, this.serverHost, this.serverPort);
    
    if (this.rtpSession) {
      this.rtpSession.stop();
      this.rtpSession = null;
    }
    
    this.activeCall.state = 'terminated';
    this.activeCall.endTime = Date.now();
    
    console.log('Call ended');
    this.activeCall = null;
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
      case SIPMethods.INVITE:
        this.handleIncomingCall(request, rinfo);
        break;
      case SIPMethods.BYE:
        this.handleBye(request, rinfo);
        break;
      default:
        this.sendResponse(request, 501, 'Not Implemented', rinfo);
    }
  }

  /**
   * Handle SIP response
   */
  handleSIPResponse(response, rinfo) {
    const statusCode = response.statusCode;
    
    if (response.getCSeq()?.method === 'REGISTER') {
      if (statusCode === 200) {
        this.registered = true;
        console.log('Registration successful');
        this.emit('registered');
      } else {
        console.log(`Registration failed: ${statusCode}`);
      }
    } else if (response.getCSeq()?.method === 'INVITE') {
      this.handleInviteResponse(response, rinfo);
    }
  }

  /**
   * Handle INVITE response
   */
  handleInviteResponse(response, rinfo) {
    const statusCode = response.statusCode;
    
    if (statusCode === 180) {
      console.log('Call is ringing...');
      this.activeCall.state = 'ringing';
    } else if (statusCode === 200) {
      console.log('Call answered!');
      this.activeCall.state = 'established';
      
      // Send ACK
      this.sendAck(response, rinfo);
      
      // Start RTP session
      this.startRTPSession(response);
      
    } else if (statusCode >= 400) {
      console.log(`Call failed: ${statusCode}`);
      this.activeCall.state = 'failed';
      this.activeCall = null;
    }
  }

  /**
   * Send ACK
   */
  sendAck(response, rinfo) {
    const ack = new SIPMessage();
    ack.method = SIPMethods.ACK;
    ack.uri = `sip:${this.activeCall.targetUser}@${this.serverHost}:${this.serverPort}`;
    ack.version = 'SIP/2.0';
    
    ack.setHeader('via', `SIP/2.0/UDP ${this.transport.host}:${this.localPort};branch=z9hG4bK${Math.random().toString(36).substr(2, 9)}`);
    ack.setHeader('from', response.getHeader('to'));
    ack.setHeader('to', response.getHeader('from'));
    ack.setHeader('call-id', this.activeCall.callId);
    ack.setHeader('cseq', `1 ACK`);
    ack.setHeader('user-agent', 'VoIP-Learning-Client/1.0');
    ack.setHeader('content-length', '0');
    
    this.transport.sendSIPMessage(ack, this.serverHost, this.serverPort);
  }

  /**
   * Handle incoming call
   */
  handleIncomingCall(request, rinfo) {
    const from = request.getHeader('from');
    const callId = request.getCallId();
    
    console.log(`Incoming call from ${from}`);
    
    // Auto-answer for demo
    setTimeout(() => {
      this.answerCall(request, rinfo);
    }, 1000);
  }

  /**
   * Answer incoming call
   */
  answerCall(request, rinfo) {
    const response = request.createResponse(200, 'OK');
    
    // Generate SDP
    const sdp = this.generateSDP();
    response.setHeader('content-type', 'application/sdp');
    response.setHeader('content-length', sdp.length.toString());
    response.body = sdp;
    
    this.activeCall = {
      callId: request.getCallId(),
      targetUser: 'incoming',
      state: 'established',
      startTime: Date.now()
    };
    
    this.transport.sendSIPMessage(response, rinfo.address, rinfo.port);
    
    // Start RTP session
    this.startRTPSession(response);
    
    console.log('Call answered');
  }

  /**
   * Start RTP session
   */
  startRTPSession(response) {
    this.rtpSession = new RTPSession({
      payloadType: 0, // PCMU
      clockRate: 8000
    });
    
    this.rtpSession.on('packetReady', (packet) => {
      // Handle incoming audio
      const decoded = this.codec.decode(packet.payload);
      console.log(`Received ${decoded.length} bytes of audio`);
    });
    
    this.rtpSession.start();
    console.log('RTP session started');
  }

  /**
   * Handle BYE request
   */
  handleBye(request, rinfo) {
    const response = request.createResponse(200, 'OK');
    this.transport.sendSIPMessage(response, rinfo.address, rinfo.port);
    
    if (this.rtpSession) {
      this.rtpSession.stop();
      this.rtpSession = null;
    }
    
    this.activeCall = null;
    console.log('Call ended by remote party');
  }

  /**
   * Handle RTP data
   */
  handleRTPData(data, rinfo) {
    if (this.rtpSession) {
      this.rtpSession.receivePacket(data);
    }
  }

  /**
   * Send SIP response
   */
  sendResponse(response, rinfo) {
    this.transport.sendSIPMessage(response, rinfo.address, rinfo.port);
  }

  /**
   * Send audio data
   */
  sendAudio(audioData) {
    if (this.rtpSession && this.activeCall) {
      const encoded = this.codec.encode(audioData);
      const packet = this.rtpSession.createPacket(encoded);
      
      // Send to server (in real implementation, you'd send to the remote party)
      this.transport.sendRTPPacket(packet, this.serverHost, this.serverPort + 1);
    }
  }

  /**
   * Get client status
   */
  getStatus() {
    return {
      registered: this.registered,
      activeCall: this.activeCall,
      rtpSession: !!this.rtpSession,
      transport: this.transport.getStats()
    };
  }
}

// Example usage
async function runClientExample() {
  const client = new VoIPClient({
    username: 'alice',
    serverHost: '127.0.0.1',
    serverPort: 5060,
    localPort: 5061
  });
  
  try {
    await client.start();
    
    // Register with server
    client.register();
    
    // Wait for registration
    client.on('registered', () => {
      console.log('Client registered, making test call...');
      
      // Make a call after 1 second
      setTimeout(() => {
        client.call('bob');
      }, 1000);
    });
    
    // Handle call events
    client.on('callEstablished', () => {
      console.log('Call established!');
    });
    
    client.on('callEnded', () => {
      console.log('Call ended');
    });
    
  } catch (error) {
    console.error('Client error:', error);
  }
}

// Export the client class and example
export default VoIPClient;
export { runClientExample }; 
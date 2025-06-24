/**
 * UDP Transport Layer
 * Handles SIP and RTP packet transmission over UDP
 */

import { EventEmitter } from 'events';
import dgram from 'dgram';
import { SIPMessage } from '../sip/sip-message.js';
import { RTPPacket } from '../rtp/rtp-packet.js';

export class UDPTransport extends EventEmitter {
  constructor(options = {}) {
    super();
    
    this.host = options.host || '0.0.0.0';
    this.sipPort = options.sipPort || 5060;
    this.rtpPort = options.rtpPort || 10000;
    this.rtpPortRange = options.rtpPortRange || 100;
    
    this.sipSocket = null;
    this.rtpSocket = null;
    this.isBound = false;
    
    // Connection tracking
    this.connections = new Map();
    this.rtpSessions = new Map();
    
    // Statistics
    this.stats = {
      sipPacketsSent: 0,
      sipPacketsReceived: 0,
      rtpPacketsSent: 0,
      rtpPacketsReceived: 0,
      bytesSent: 0,
      bytesReceived: 0,
      errors: 0
    };
  }

  /**
   * Initialize and bind sockets
   */
  async bind() {
    try {
      await this.bindSIPSocket();
      await this.bindRTPSocket();
      this.isBound = true;
      
      console.log(`UDP Transport bound - SIP: ${this.host}:${this.sipPort}, RTP: ${this.host}:${this.rtpPort}`);
      this.emit('bound');
      
    } catch (error) {
      console.error('Failed to bind UDP transport:', error);
      this.emit('error', error);
      throw error;
    }
  }

  /**
   * Bind SIP socket
   */
  async bindSIPSocket() {
    return new Promise((resolve, reject) => {
      this.sipSocket = dgram.createSocket('udp4');
      
      this.sipSocket.on('error', (error) => {
        console.error('SIP socket error:', error);
        this.stats.errors++;
        this.emit('error', error);
      });
      
      this.sipSocket.on('message', (msg, rinfo) => {
        this.handleSIPMessage(msg, rinfo);
      });
      
      this.sipSocket.on('listening', () => {
        const address = this.sipSocket.address();
        console.log(`SIP socket listening on ${address.address}:${address.port}`);
        resolve();
      });
      
      this.sipSocket.bind(this.sipPort, this.host, (error) => {
        if (error) {
          reject(error);
        }
      });
    });
  }

  /**
   * Bind RTP socket
   */
  async bindRTPSocket() {
    return new Promise((resolve, reject) => {
      this.rtpSocket = dgram.createSocket('udp4');
      
      this.rtpSocket.on('error', (error) => {
        console.error('RTP socket error:', error);
        this.stats.errors++;
        this.emit('error', error);
      });
      
      this.rtpSocket.on('message', (msg, rinfo) => {
        this.handleRTPMessage(msg, rinfo);
      });
      
      this.rtpSocket.on('listening', () => {
        const address = this.rtpSocket.address();
        console.log(`RTP socket listening on ${address.address}:${address.port}`);
        resolve();
      });
      
      this.rtpSocket.bind(this.rtpPort, this.host, (error) => {
        if (error) {
          reject(error);
        }
      });
    });
  }

  /**
   * Handle incoming SIP message
   */
  handleSIPMessage(msg, rinfo) {
    try {
      const message = SIPMessage.parse(msg.toString());
      this.stats.sipPacketsReceived++;
      this.stats.bytesReceived += msg.length;
      
      // Add connection info
      message.rinfo = rinfo;
      
      this.emit('sipMessage', message, rinfo);
      
    } catch (error) {
      console.error('Error parsing SIP message:', error);
      this.stats.errors++;
    }
  }

  /**
   * Handle incoming RTP message
   */
  handleRTPMessage(msg, rinfo) {
    try {
      this.stats.rtpPacketsReceived++;
      this.stats.bytesReceived += msg.length;
      
      // Emit raw RTP data for processing
      this.emit('rtpData', msg, rinfo);
      
    } catch (error) {
      console.error('Error handling RTP message:', error);
      this.stats.errors++;
    }
  }

  /**
   * Send SIP message
   */
  sendSIPMessage(message, host, port) {
    if (!this.isBound || !this.sipSocket) {
      throw new Error('SIP socket not bound');
    }
    
    try {
      const data = message.toString();
      const buffer = Buffer.from(data, 'utf8');
      
      this.sipSocket.send(buffer, port, host, (error) => {
        if (error) {
          console.error('Error sending SIP message:', error);
          this.stats.errors++;
          this.emit('error', error);
        } else {
          this.stats.sipPacketsSent++;
          this.stats.bytesSent += buffer.length;
        }
      });
      
    } catch (error) {
      console.error('Error preparing SIP message:', error);
      this.stats.errors++;
      throw error;
    }
  }

  /**
   * Send RTP packet
   */
  sendRTPPacket(packet, host, port) {
    if (!this.isBound || !this.rtpSocket) {
      throw new Error('RTP socket not bound');
    }
    
    try {
      const buffer = packet.toBuffer();
      
      this.rtpSocket.send(buffer, port, host, (error) => {
        if (error) {
          console.error('Error sending RTP packet:', error);
          this.stats.errors++;
          this.emit('error', error);
        } else {
          this.stats.rtpPacketsSent++;
          this.stats.bytesSent += buffer.length;
        }
      });
      
    } catch (error) {
      console.error('Error preparing RTP packet:', error);
      this.stats.errors++;
      throw error;
    }
  }

  /**
   * Send raw RTP data
   */
  sendRTPData(data, host, port) {
    if (!this.isBound || !this.rtpSocket) {
      throw new Error('RTP socket not bound');
    }
    
    try {
      this.rtpSocket.send(data, port, host, (error) => {
        if (error) {
          console.error('Error sending RTP data:', error);
          this.stats.errors++;
          this.emit('error', error);
        } else {
          this.stats.rtpPacketsSent++;
          this.stats.bytesSent += data.length;
        }
      });
      
    } catch (error) {
      console.error('Error sending RTP data:', error);
      this.stats.errors++;
      throw error;
    }
  }

  /**
   * Get available RTP port
   */
  getAvailableRTPPort() {
    // Simple port allocation - in production, you'd want more sophisticated port management
    return this.rtpPort + Math.floor(Math.random() * this.rtpPortRange);
  }

  /**
   * Create RTP session
   */
  createRTPSession(ssrc, remoteHost, remotePort) {
    const session = {
      ssrc,
      remoteHost,
      remotePort,
      localPort: this.getAvailableRTPPort(),
      packetsSent: 0,
      packetsReceived: 0,
      bytesSent: 0,
      bytesReceived: 0,
      startTime: Date.now()
    };
    
    this.rtpSessions.set(ssrc, session);
    this.emit('rtpSessionCreated', session);
    
    return session;
  }

  /**
   * Get RTP session
   */
  getRTPSession(ssrc) {
    return this.rtpSessions.get(ssrc);
  }

  /**
   * Remove RTP session
   */
  removeRTPSession(ssrc) {
    const session = this.rtpSessions.get(ssrc);
    if (session) {
      this.rtpSessions.delete(ssrc);
      this.emit('rtpSessionRemoved', session);
    }
  }

  /**
   * Get transport statistics
   */
  getStats() {
    return {
      ...this.stats,
      isBound: this.isBound,
      sipPort: this.sipPort,
      rtpPort: this.rtpPort,
      activeConnections: this.connections.size,
      activeRTPSessions: this.rtpSessions.size
    };
  }

  /**
   * Get connection info
   */
  getConnectionInfo(host, port) {
    const key = `${host}:${port}`;
    return this.connections.get(key);
  }

  /**
   * Add connection info
   */
  addConnection(host, port, info = {}) {
    const key = `${host}:${port}`;
    this.connections.set(key, {
      host,
      port,
      lastSeen: Date.now(),
      packetsSent: 0,
      packetsReceived: 0,
      ...info
    });
  }

  /**
   * Remove connection
   */
  removeConnection(host, port) {
    const key = `${host}:${port}`;
    this.connections.delete(key);
  }

  /**
   * Close transport
   */
  close() {
    this.isBound = false;
    
    if (this.sipSocket) {
      this.sipSocket.close();
      this.sipSocket = null;
    }
    
    if (this.rtpSocket) {
      this.rtpSocket.close();
      this.rtpSocket = null;
    }
    
    this.connections.clear();
    this.rtpSessions.clear();
    
    console.log('UDP Transport closed');
    this.emit('closed');
  }

  /**
   * Set socket options
   */
  setSocketOptions(options = {}) {
    if (this.sipSocket) {
      if (options.sipBufferSize) {
        this.sipSocket.setRecvBufferSize(options.sipBufferSize);
        this.sipSocket.setSendBufferSize(options.sipBufferSize);
      }
    }
    
    if (this.rtpSocket) {
      if (options.rtpBufferSize) {
        this.rtpSocket.setRecvBufferSize(options.rtpBufferSize);
        this.rtpSocket.setSendBufferSize(options.rtpBufferSize);
      }
    }
  }

  /**
   * Enable/disable broadcast
   */
  setBroadcast(enabled) {
    if (this.sipSocket) {
      this.sipSocket.setBroadcast(enabled);
    }
    if (this.rtpSocket) {
      this.rtpSocket.setBroadcast(enabled);
    }
  }

  /**
   * Set TTL (Time To Live)
   */
  setTTL(ttl) {
    if (this.sipSocket) {
      this.sipSocket.setTTL(ttl);
    }
    if (this.rtpSocket) {
      this.rtpSocket.setTTL(ttl);
    }
  }
}

// Export constants
export const UDP_CONSTANTS = {
  DEFAULT_SIP_PORT: 5060,
  DEFAULT_RTP_PORT: 10000,
  DEFAULT_RTP_PORT_RANGE: 100,
  MAX_UDP_SIZE: 65507,
  SIP_BUFFER_SIZE: 65536,
  RTP_BUFFER_SIZE: 65536
}; 
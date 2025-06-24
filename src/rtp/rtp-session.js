/**
 * RTP Session Manager
 * Handles RTP session state, jitter buffering, and packet ordering
 */

import { EventEmitter } from 'events';
import { RTPPacket, RTPPayloadTypes } from './rtp-packet.js';

export class RTPSession extends EventEmitter {
  constructor(options = {}) {
    super();
    
    this.ssrc = options.ssrc || Math.floor(Math.random() * 0xFFFFFFFF);
    this.payloadType = options.payloadType || RTPPayloadTypes.PCMU;
    this.clockRate = options.clockRate || 8000;
    this.sampleRate = options.sampleRate || 8000;
    this.channels = options.channels || 1;
    
    // Jitter buffer settings
    this.jitterBufferSize = options.jitterBufferSize || 50; // packets
    this.jitterBufferDelay = options.jitterBufferDelay || 100; // ms
    this.maxJitterBufferDelay = options.maxJitterBufferDelay || 500; // ms
    
    // Session state
    this.sequenceNumber = Math.floor(Math.random() * 0xFFFF);
    this.timestamp = Math.floor(Math.random() * 0xFFFFFFFF);
    this.lastTimestamp = 0;
    this.lastSequenceNumber = 0;
    
    // Jitter buffer
    this.jitterBuffer = new Map();
    this.expectedSequenceNumber = 0;
    this.baseTimestamp = 0;
    this.lastArrivalTime = 0;
    this.jitter = 0;
    
    // Statistics
    this.stats = {
      packetsReceived: 0,
      packetsLost: 0,
      packetsOutOfOrder: 0,
      packetsDuplicated: 0,
      jitter: 0,
      roundTripTime: 0,
      bytesReceived: 0,
      startTime: Date.now()
    };
    
    // Media processing
    this.isActive = false;
    this.mediaProcessor = null;
  }

  /**
   * Start the RTP session
   */
  start() {
    this.isActive = true;
    this.baseTimestamp = this.timestamp;
    this.expectedSequenceNumber = this.sequenceNumber;
    this.lastArrivalTime = Date.now();
    
    console.log(`RTP Session started - SSRC: ${this.ssrc.toString(16)}, Payload: ${this.payloadType}`);
    this.emit('started');
  }

  /**
   * Stop the RTP session
   */
  stop() {
    this.isActive = false;
    this.jitterBuffer.clear();
    this.emit('stopped');
  }

  /**
   * Create an RTP packet with audio data
   */
  createPacket(audioData, marker = false) {
    const packet = new RTPPacket();
    
    packet.version = 2;
    packet.payloadType = this.payloadType;
    packet.sequenceNumber = this.sequenceNumber;
    packet.timestamp = this.timestamp;
    packet.ssrc = this.ssrc;
    packet.marker = marker;
    packet.payload = audioData;
    
    // Increment sequence number and timestamp
    this.sequenceNumber = (this.sequenceNumber + 1) % 0x10000;
    this.timestamp += this.getSamplesPerPacket();
    
    return packet;
  }

  /**
   * Get samples per packet based on payload type
   */
  getSamplesPerPacket() {
    switch (this.payloadType) {
      case RTPPayloadTypes.PCMU:
      case RTPPayloadTypes.PCMA:
        return 160; // 20ms at 8kHz
      case RTPPayloadTypes.G729:
        return 80;  // 10ms at 8kHz
      case RTPPayloadTypes.G722:
        return 320; // 20ms at 16kHz
      default:
        return 160; // Default to 20ms
    }
  }

  /**
   * Receive and process an RTP packet
   */
  receivePacket(packetBuffer) {
    try {
      const packet = RTPPacket.parse(packetBuffer);
      
      if (!packet.isValid()) {
        console.warn('Received invalid RTP packet');
        return;
      }
      
      this.processPacket(packet);
    } catch (error) {
      console.error('Error parsing RTP packet:', error);
    }
  }

  /**
   * Process received RTP packet
   */
  processPacket(packet) {
    if (!this.isActive) return;
    
    const now = Date.now();
    this.stats.packetsReceived++;
    this.stats.bytesReceived += packet.payload.length;
    
    // Calculate jitter
    this.calculateJitter(packet, now);
    
    // Handle sequence number wrapping
    const sequenceDiff = this.getSequenceNumberDifference(packet.sequenceNumber, this.lastSequenceNumber);
    
    if (sequenceDiff > 0) {
      // New packet
      this.lastSequenceNumber = packet.sequenceNumber;
      this.lastTimestamp = packet.timestamp;
      this.lastArrivalTime = now;
      
      // Add to jitter buffer
      this.addToJitterBuffer(packet, now);
      
      // Process jitter buffer
      this.processJitterBuffer();
    } else if (sequenceDiff === 0) {
      // Duplicate packet
      this.stats.packetsDuplicated++;
    } else {
      // Out of order packet
      this.stats.packetsOutOfOrder++;
      this.addToJitterBuffer(packet, now);
    }
  }

  /**
   * Calculate jitter using RFC 3550 algorithm
   */
  calculateJitter(packet, arrivalTime) {
    if (this.lastArrivalTime === 0) {
      this.lastArrivalTime = arrivalTime;
      return;
    }
    
    const transitTime = arrivalTime - this.lastArrivalTime;
    const expectedTransitTime = (packet.timestamp - this.lastTimestamp) * 1000 / this.clockRate;
    const d = Math.abs(transitTime - expectedTransitTime);
    
    this.jitter += (1/16) * (d - this.jitter);
    this.stats.jitter = this.jitter;
    
    this.lastArrivalTime = arrivalTime;
    this.lastTimestamp = packet.timestamp;
  }

  /**
   * Get sequence number difference handling wrapping
   */
  getSequenceNumberDifference(seq1, seq2) {
    const diff = seq1 - seq2;
    if (diff > 32767) return diff - 65536;
    if (diff < -32768) return diff + 65536;
    return diff;
  }

  /**
   * Add packet to jitter buffer
   */
  addToJitterBuffer(packet, arrivalTime) {
    const key = packet.sequenceNumber;
    
    // Remove old packets if buffer is full
    if (this.jitterBuffer.size >= this.jitterBufferSize) {
      const oldestKey = this.jitterBuffer.keys().next().value;
      this.jitterBuffer.delete(oldestKey);
    }
    
    this.jitterBuffer.set(key, {
      packet,
      arrivalTime,
      timestamp: packet.timestamp
    });
  }

  /**
   * Process jitter buffer and emit ready packets
   */
  processJitterBuffer() {
    const now = Date.now();
    const readyPackets = [];
    
    // Sort packets by sequence number
    const sortedPackets = Array.from(this.jitterBuffer.entries())
      .sort(([a], [b]) => this.getSequenceNumberDifference(a, b));
    
    for (const [sequenceNumber, packetInfo] of sortedPackets) {
      const delay = now - packetInfo.arrivalTime;
      
      // Check if packet is ready to be played
      if (delay >= this.jitterBufferDelay || 
          this.jitterBuffer.size >= this.jitterBufferSize) {
        
        readyPackets.push(packetInfo.packet);
        this.jitterBuffer.delete(sequenceNumber);
      }
    }
    
    // Emit ready packets in order
    for (const packet of readyPackets) {
      this.emit('packetReady', packet);
    }
    
    // Update expected sequence number
    if (readyPackets.length > 0) {
      this.expectedSequenceNumber = (readyPackets[readyPackets.length - 1].sequenceNumber + 1) % 0x10000;
    }
  }

  /**
   * Get session statistics
   */
  getStats() {
    const now = Date.now();
    const duration = (now - this.stats.startTime) / 1000;
    
    return {
      ...this.stats,
      duration,
      packetRate: this.stats.packetsReceived / duration,
      bitRate: (this.stats.bytesReceived * 8) / duration,
      lossRate: this.stats.packetsLost / Math.max(this.stats.packetsReceived, 1),
      jitterBufferSize: this.jitterBuffer.size,
      isActive: this.isActive
    };
  }

  /**
   * Set media processor for audio handling
   */
  setMediaProcessor(processor) {
    this.mediaProcessor = processor;
    
    this.on('packetReady', (packet) => {
      if (this.mediaProcessor) {
        this.mediaProcessor.processPacket(packet);
      }
    });
  }

  /**
   * Send audio data
   */
  sendAudio(audioData, marker = false) {
    if (!this.isActive) return null;
    
    const packet = this.createPacket(audioData, marker);
    this.emit('packetCreated', packet);
    
    return packet;
  }

  /**
   * Handle RTCP feedback
   */
  handleRTCP(rtcpPacket) {
    // Process RTCP packets for feedback
    this.emit('rtcpReceived', rtcpPacket);
  }

  /**
   * Generate RTCP report
   */
  generateRTCPReport() {
    const stats = this.getStats();
    
    return {
      ssrc: this.ssrc,
      fractionLost: Math.min(255, Math.floor(stats.lossRate * 256)),
      cumulativePacketsLost: stats.packetsLost,
      extendedHighestSequenceNumber: this.lastSequenceNumber,
      jitter: Math.floor(stats.jitter),
      lastSRTimestamp: this.lastTimestamp,
      delaySinceLastSR: Date.now() - this.lastArrivalTime
    };
  }

  /**
   * Reset session state
   */
  reset() {
    this.sequenceNumber = Math.floor(Math.random() * 0xFFFF);
    this.timestamp = Math.floor(Math.random() * 0xFFFFFFFF);
    this.lastTimestamp = 0;
    this.lastSequenceNumber = 0;
    this.jitterBuffer.clear();
    this.expectedSequenceNumber = 0;
    this.baseTimestamp = 0;
    this.lastArrivalTime = 0;
    this.jitter = 0;
    
    this.stats = {
      packetsReceived: 0,
      packetsLost: 0,
      packetsOutOfOrder: 0,
      packetsDuplicated: 0,
      jitter: 0,
      roundTripTime: 0,
      bytesReceived: 0,
      startTime: Date.now()
    };
  }
} 
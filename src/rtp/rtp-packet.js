/**
 * RTP Packet Class
 * Handles RTP packet parsing and construction
 * 
 * RTP Header Format (12 bytes):
 * - Version (2 bits)
 * - Padding (1 bit)
 * - Extension (1 bit)
 * - CSRC count (4 bits)
 * - Marker (1 bit)
 * - Payload type (7 bits)
 * - Sequence number (16 bits)
 * - Timestamp (32 bits)
 * - SSRC identifier (32 bits)
 * - CSRC list (optional)
 * - Extension header (optional)
 * - Payload
 */

export class RTPPacket {
  constructor() {
    this.version = 2;
    this.padding = false;
    this.extension = false;
    this.csrcCount = 0;
    this.marker = false;
    this.payloadType = 0;
    this.sequenceNumber = 0;
    this.timestamp = 0;
    this.ssrc = 0;
    this.csrcList = [];
    this.extensionHeader = null;
    this.payload = Buffer.alloc(0);
  }

  /**
   * Parse RTP packet from buffer
   */
  static parse(buffer) {
    if (buffer.length < 12) {
      throw new Error('RTP packet too short');
    }

    const packet = new RTPPacket();
    
    // Parse first byte
    const firstByte = buffer[0];
    packet.version = (firstByte >> 6) & 0x03;
    packet.padding = ((firstByte >> 5) & 0x01) === 1;
    packet.extension = ((firstByte >> 4) & 0x01) === 1;
    packet.csrcCount = firstByte & 0x0F;

    // Parse second byte
    const secondByte = buffer[1];
    packet.marker = ((secondByte >> 7) & 0x01) === 1;
    packet.payloadType = secondByte & 0x7F;

    // Parse sequence number (16 bits)
    packet.sequenceNumber = buffer.readUInt16BE(2);

    // Parse timestamp (32 bits)
    packet.timestamp = buffer.readUInt32BE(4);

    // Parse SSRC (32 bits)
    packet.ssrc = buffer.readUInt32BE(8);

    let offset = 12;

    // Parse CSRC list
    for (let i = 0; i < packet.csrcCount; i++) {
      if (offset + 4 <= buffer.length) {
        packet.csrcList.push(buffer.readUInt32BE(offset));
        offset += 4;
      }
    }

    // Parse extension header
    if (packet.extension && offset + 4 <= buffer.length) {
      const extHeaderId = buffer.readUInt16BE(offset);
      const extHeaderLength = buffer.readUInt16BE(offset + 2);
      offset += 4;

      if (offset + extHeaderLength * 4 <= buffer.length) {
        packet.extensionHeader = {
          id: extHeaderId,
          data: buffer.slice(offset, offset + extHeaderLength * 4)
        };
        offset += extHeaderLength * 4;
      }
    }

    // Parse payload
    packet.payload = buffer.slice(offset);

    // Handle padding
    if (packet.padding && packet.payload.length > 0) {
      const paddingLength = packet.payload[packet.payload.length - 1];
      if (paddingLength <= packet.payload.length) {
        packet.payload = packet.payload.slice(0, packet.payload.length - paddingLength);
      }
    }

    return packet;
  }

  /**
   * Convert packet to buffer
   */
  toBuffer() {
    const headerSize = 12 + (this.csrcCount * 4) + 
                      (this.extensionHeader ? 4 + this.extensionHeader.data.length : 0);
    const buffer = Buffer.alloc(headerSize + this.payload.length);

    // Build first byte
    let firstByte = (this.version << 6) | 
                   (this.padding ? 0x20 : 0) | 
                   (this.extension ? 0x10 : 0) | 
                   this.csrcCount;
    buffer[0] = firstByte;

    // Build second byte
    let secondByte = (this.marker ? 0x80 : 0) | this.payloadType;
    buffer[1] = secondByte;

    // Write sequence number
    buffer.writeUInt16BE(this.sequenceNumber, 2);

    // Write timestamp
    buffer.writeUInt32BE(this.timestamp, 4);

    // Write SSRC
    buffer.writeUInt32BE(this.ssrc, 8);

    let offset = 12;

    // Write CSRC list
    for (const csrc of this.csrcList) {
      buffer.writeUInt32BE(csrc, offset);
      offset += 4;
    }

    // Write extension header
    if (this.extensionHeader) {
      buffer.writeUInt16BE(this.extensionHeader.id, offset);
      buffer.writeUInt16BE(this.extensionHeader.data.length / 4, offset + 2);
      offset += 4;
      this.extensionHeader.data.copy(buffer, offset);
      offset += this.extensionHeader.data.length;
    }

    // Write payload
    this.payload.copy(buffer, offset);

    return buffer;
  }

  /**
   * Get packet size
   */
  getSize() {
    return 12 + (this.csrcCount * 4) + 
           (this.extensionHeader ? 4 + this.extensionHeader.data.length : 0) + 
           this.payload.length;
  }

  /**
   * Check if packet is valid
   */
  isValid() {
    return this.version === 2 && 
           this.payloadType >= 0 && 
           this.payloadType <= 127;
  }

  /**
   * Get payload type name
   */
  getPayloadTypeName() {
    const payloadTypes = {
      0: 'PCMU',
      8: 'PCMA',
      18: 'G729',
      101: 'telephone-event',
      102: 'telephone-event',
      103: 'telephone-event',
      104: 'telephone-event',
      105: 'telephone-event',
      106: 'telephone-event',
      107: 'telephone-event',
      108: 'telephone-event',
      109: 'telephone-event',
      110: 'telephone-event',
      111: 'telephone-event',
      112: 'telephone-event',
      113: 'telephone-event',
      114: 'telephone-event',
      115: 'telephone-event',
      116: 'telephone-event',
      117: 'telephone-event',
      118: 'telephone-event',
      119: 'telephone-event',
      120: 'telephone-event',
      121: 'telephone-event',
      122: 'telephone-event',
      123: 'telephone-event',
      124: 'telephone-event',
      125: 'telephone-event',
      126: 'telephone-event',
      127: 'telephone-event'
    };
    return payloadTypes[this.payloadType] || `Unknown(${this.payloadType})`;
  }

  /**
   * Log packet details for debugging
   */
  log() {
    console.log('=== RTP Packet ===');
    console.log(`Version: ${this.version}`);
    console.log(`Padding: ${this.padding}`);
    console.log(`Extension: ${this.extension}`);
    console.log(`CSRC Count: ${this.csrcCount}`);
    console.log(`Marker: ${this.marker}`);
    console.log(`Payload Type: ${this.payloadType} (${this.getPayloadTypeName()})`);
    console.log(`Sequence Number: ${this.sequenceNumber}`);
    console.log(`Timestamp: ${this.timestamp}`);
    console.log(`SSRC: ${this.ssrc.toString(16)}`);
    console.log(`Payload Size: ${this.payload.length} bytes`);
    console.log('==================');
  }
}

// Common RTP payload types
export const RTPPayloadTypes = {
  PCMU: 0,      // G.711 μ-law
  PCMA: 8,      // G.711 A-law
  G729: 18,     // G.729
  G722: 9,      // G.722
  OPUS: 111,    // Opus
  TELEPHONE_EVENT: 101  // DTMF
};

// RTP header constants
export const RTP_CONSTANTS = {
  VERSION: 2,
  HEADER_SIZE: 12,
  MAX_CSRC_COUNT: 15,
  MAX_PAYLOAD_TYPE: 127
}; 
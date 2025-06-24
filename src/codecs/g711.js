/**
 * G.711 Codec Implementation
 * Provides μ-law and A-law encoding/decoding
 * 
 * G.711 is a narrowband audio codec that compresses 16-bit PCM to 8-bit
 * Used extensively in VoIP for its simplicity and low computational requirements
 */

export class G711Codec {
  constructor(type = 'mulaw') {
    this.type = type.toLowerCase(); // 'mulaw' or 'alaw'
    this.sampleRate = 8000;
    this.channels = 1;
    this.bitsPerSample = 16;
    
    // Pre-computed lookup tables for performance
    this.mulawEncodeTable = this.buildMulawEncodeTable();
    this.mulawDecodeTable = this.buildMulawDecodeTable();
    this.alawEncodeTable = this.buildAlawEncodeTable();
    this.alawDecodeTable = this.buildAlawDecodeTable();
  }

  /**
   * Encode 16-bit PCM to G.711
   */
  encode(pcmData) {
    if (this.type === 'mulaw') {
      return this.encodeMulaw(pcmData);
    } else {
      return this.encodeAlaw(pcmData);
    }
  }

  /**
   * Decode G.711 to 16-bit PCM
   */
  decode(encodedData) {
    if (this.type === 'mulaw') {
      return this.decodeMulaw(encodedData);
    } else {
      return this.decodeAlaw(encodedData);
    }
  }

  /**
   * Encode using μ-law
   */
  encodeMulaw(pcmData) {
    const encoded = Buffer.alloc(pcmData.length);
    
    for (let i = 0; i < pcmData.length; i += 2) {
      const sample = pcmData.readInt16LE(i);
      encoded[i / 2] = this.mulawEncodeTable[sample + 32768];
    }
    
    return encoded;
  }

  /**
   * Decode using μ-law
   */
  decodeMulaw(encodedData) {
    const decoded = Buffer.alloc(encodedData.length * 2);
    
    for (let i = 0; i < encodedData.length; i++) {
      const sample = this.mulawDecodeTable[encodedData[i]];
      decoded.writeInt16LE(sample, i * 2);
    }
    
    return decoded;
  }

  /**
   * Encode using A-law
   */
  encodeAlaw(pcmData) {
    const encoded = Buffer.alloc(pcmData.length);
    
    for (let i = 0; i < pcmData.length; i += 2) {
      const sample = pcmData.readInt16LE(i);
      encoded[i / 2] = this.alawEncodeTable[sample + 32768];
    }
    
    return encoded;
  }

  /**
   * Decode using A-law
   */
  decodeAlaw(encodedData) {
    const decoded = Buffer.alloc(encodedData.length * 2);
    
    for (let i = 0; i < encodedData.length; i++) {
      const sample = this.alawDecodeTable[encodedData[i]];
      decoded.writeInt16LE(sample, i * 2);
    }
    
    return decoded;
  }

  /**
   * Build μ-law encoding lookup table
   */
  buildMulawEncodeTable() {
    const table = new Uint8Array(65536);
    
    for (let i = 0; i < 65536; i++) {
      const sample = i - 32768;
      table[i] = this.mulawEncodeSample(sample);
    }
    
    return table;
  }

  /**
   * Build μ-law decoding lookup table
   */
  buildMulawDecodeTable() {
    const table = new Int16Array(256);
    
    for (let i = 0; i < 256; i++) {
      table[i] = this.mulawDecodeSample(i);
    }
    
    return table;
  }

  /**
   * Build A-law encoding lookup table
   */
  buildAlawEncodeTable() {
    const table = new Uint8Array(65536);
    
    for (let i = 0; i < 65536; i++) {
      const sample = i - 32768;
      table[i] = this.alawEncodeSample(sample);
    }
    
    return table;
  }

  /**
   * Build A-law decoding lookup table
   */
  buildAlawDecodeTable() {
    const table = new Int16Array(256);
    
    for (let i = 0; i < 256; i++) {
      table[i] = this.alawDecodeSample(i);
    }
    
    return table;
  }

  /**
   * Encode a single sample using μ-law
   */
  mulawEncodeSample(sample) {
    const MULAW_BIAS = 33;
    const MULAW_CLIP = 32635;
    
    let sign = (sample >> 8) & 0x80;
    if (sign !== 0) {
      sample = -sample;
    }
    if (sample > MULAW_CLIP) {
      sample = MULAW_CLIP;
    }
    
    sample += MULAW_BIAS;
    
    let exponent = 7;
    let mask = 0x4000;
    
    while ((sample & mask) === 0 && exponent > 0) {
      exponent--;
      mask >>= 1;
    }
    
    const mantissa = (sample >> (exponent + 3)) & 0x0F;
    const mulaw = ~(sign | (exponent << 4) | mantissa);
    
    return mulaw & 0xFF;
  }

  /**
   * Decode a single sample using μ-law
   */
  mulawDecodeSample(mulaw) {
    const MULAW_BIAS = 33;
    
    mulaw = ~mulaw;
    const sign = mulaw & 0x80;
    const exponent = (mulaw >> 4) & 0x07;
    const mantissa = mulaw & 0x0F;
    
    let sample = mantissa << (exponent + 3);
    sample += MULAW_BIAS;
    
    if (sign !== 0) {
      sample = -sample;
    }
    
    return sample;
  }

  /**
   * Encode a single sample using A-law
   */
  alawEncodeSample(sample) {
    const ALAW_CLIP = 32635;
    const ALAW_BIAS = 0x84;
    
    let sign = (sample >> 8) & 0x80;
    if (sign !== 0) {
      sample = -sample;
    }
    if (sample > ALAW_CLIP) {
      sample = ALAW_CLIP;
    }
    
    let exponent = 7;
    let mask = 0x4000;
    
    while ((sample & mask) === 0 && exponent > 0) {
      exponent--;
      mask >>= 1;
    }
    
    const mantissa = (sample >> (exponent + 4)) & 0x0F;
    let alaw = sign | (exponent << 4) | mantissa;
    
    return alaw ^ 0x55;
  }

  /**
   * Decode a single sample using A-law
   */
  alawDecodeSample(alaw) {
    const ALAW_BIAS = 0x84;
    
    alaw ^= 0x55;
    const sign = alaw & 0x80;
    const exponent = (alaw >> 4) & 0x07;
    const mantissa = alaw & 0x0F;
    
    let sample = mantissa << (exponent + 4);
    sample += ALAW_BIAS;
    
    if (sign !== 0) {
      sample = -sample;
    }
    
    return sample;
  }

  /**
   * Get codec information
   */
  getInfo() {
    return {
      name: `G.711 ${this.type.toUpperCase()}`,
      type: this.type,
      sampleRate: this.sampleRate,
      channels: this.channels,
      bitsPerSample: this.bitsPerSample,
      compressionRatio: 2, // 16-bit to 8-bit
      bitRate: this.sampleRate * 8 // 64 kbps
    };
  }

  /**
   * Calculate compression ratio
   */
  getCompressionRatio() {
    return 2; // 16-bit PCM to 8-bit G.711
  }

  /**
   * Get bit rate
   */
  getBitRate() {
    return this.sampleRate * 8; // 64 kbps
  }

  /**
   * Get samples per frame
   */
  getSamplesPerFrame() {
    return 160; // 20ms at 8kHz
  }

  /**
   * Get frame size in bytes
   */
  getFrameSize() {
    return this.getSamplesPerFrame(); // 160 bytes for G.711
  }

  /**
   * Convert between μ-law and A-law
   */
  static convertMulawToAlaw(mulawData) {
    const alawData = Buffer.alloc(mulawData.length);
    
    for (let i = 0; i < mulawData.length; i++) {
      // Decode μ-law to PCM
      const pcm = G711Codec.mulawDecodeSample(mulawData[i]);
      // Encode PCM to A-law
      alawData[i] = G711Codec.alawEncodeSample(pcm);
    }
    
    return alawData;
  }

  /**
   * Convert between A-law and μ-law
   */
  static convertAlawToMulaw(alawData) {
    const mulawData = Buffer.alloc(alawData.length);
    
    for (let i = 0; i < alawData.length; i++) {
      // Decode A-law to PCM
      const pcm = G711Codec.alawDecodeSample(alawData[i]);
      // Encode PCM to μ-law
      mulawData[i] = G711Codec.mulawEncodeSample(pcm);
    }
    
    return mulawData;
  }

  /**
   * Static methods for direct encoding/decoding
   */
  static mulawEncodeSample(sample) {
    const codec = new G711Codec('mulaw');
    return codec.mulawEncodeSample(sample);
  }

  static mulawDecodeSample(mulaw) {
    const codec = new G711Codec('mulaw');
    return codec.mulawDecodeSample(mulaw);
  }

  static alawEncodeSample(sample) {
    const codec = new G711Codec('alaw');
    return codec.alawEncodeSample(sample);
  }

  static alawDecodeSample(alaw) {
    const codec = new G711Codec('alaw');
    return codec.alawDecodeSample(alaw);
  }
}

// Export constants
export const G711_CONSTANTS = {
  SAMPLE_RATE: 8000,
  CHANNELS: 1,
  BITS_PER_SAMPLE: 16,
  COMPRESSION_RATIO: 2,
  BIT_RATE: 64000,
  SAMPLES_PER_FRAME: 160,
  FRAME_DURATION: 20 // ms
}; 
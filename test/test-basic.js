/**
 * Basic Tests for VoIP Components
 */

import { SIPMessage, SIPMethods, SIPStatusCodes } from '../src/sip/sip-message.js';
import { RTPPacket, RTPPayloadTypes } from '../src/rtp/rtp-packet.js';
import { G711Codec } from '../src/codecs/g711.js';

// Test SIP Message parsing and construction
function testSIPMessage() {
  console.log('Testing SIP Message...');
  
  const rawMessage = `INVITE sip:bob@example.com SIP/2.0
Via: SIP/2.0/UDP 192.168.1.100:5060;branch=z9hG4bK123456
From: <sip:alice@example.com>;tag=abc123
To: <sip:bob@example.com>
Call-ID: call123@192.168.1.100
CSeq: 1 INVITE
Contact: <sip:alice@192.168.1.100:5060>
Content-Type: application/sdp
Content-Length: 0

`;

  try {
    const message = SIPMessage.parse(rawMessage);
    
    console.log('✓ SIP Message parsed successfully');
    console.log(`  Method: ${message.method}`);
    console.log(`  URI: ${message.uri}`);
    console.log(`  Call-ID: ${message.getCallId()}`);
    console.log(`  From: ${message.getHeader('from')}`);
    console.log(`  To: ${message.getHeader('to')}`);
    
    // Test response creation
    const response = message.createResponse(200, 'OK');
    console.log('✓ Response created successfully');
    console.log(`  Status: ${response.statusCode} ${response.reasonPhrase}`);
    
    return true;
  } catch (error) {
    console.error('✗ SIP Message test failed:', error);
    return false;
  }
}

// Test RTP Packet parsing and construction
function testRTPPacket() {
  console.log('\nTesting RTP Packet...');
  
  try {
    // Create a test RTP packet
    const packet = new RTPPacket();
    packet.version = 2;
    packet.payloadType = RTPPayloadTypes.PCMU;
    packet.sequenceNumber = 12345;
    packet.timestamp = 987654321;
    packet.ssrc = 0x12345678;
    packet.payload = Buffer.from('test audio data');
    
    console.log('✓ RTP Packet created successfully');
    console.log(`  Version: ${packet.version}`);
    console.log(`  Payload Type: ${packet.payloadType} (${packet.getPayloadTypeName()})`);
    console.log(`  Sequence: ${packet.sequenceNumber}`);
    console.log(`  Timestamp: ${packet.timestamp}`);
    console.log(`  SSRC: ${packet.ssrc.toString(16)}`);
    console.log(`  Payload Size: ${packet.payload.length} bytes`);
    
    // Convert to buffer and back
    const buffer = packet.toBuffer();
    const parsedPacket = RTPPacket.parse(buffer);
    
    console.log('✓ RTP Packet serialization/deserialization successful');
    console.log(`  Parsed Version: ${parsedPacket.version}`);
    console.log(`  Parsed Payload Type: ${parsedPacket.payloadType}`);
    console.log(`  Parsed Sequence: ${parsedPacket.sequenceNumber}`);
    
    return true;
  } catch (error) {
    console.error('✗ RTP Packet test failed:', error);
    return false;
  }
}

// Test G.711 Codec
function testG711Codec() {
  console.log('\nTesting G.711 Codec...');
  
  try {
    const codec = new G711Codec('mulaw');
    
    // Create test PCM data (160 samples = 320 bytes)
    const pcmData = Buffer.alloc(320);
    for (let i = 0; i < 160; i++) {
      pcmData.writeInt16LE(Math.sin(i * 0.1) * 1000, i * 2);
    }
    
    console.log('✓ Test PCM data created');
    console.log(`  PCM Size: ${pcmData.length} bytes`);
    console.log(`  Samples: ${pcmData.length / 2}`);
    
    // Encode
    const encoded = codec.encode(pcmData);
    console.log('✓ G.711 encoding successful');
    console.log(`  Encoded Size: ${encoded.length} bytes`);
    console.log(`  Compression Ratio: ${pcmData.length / encoded.length}:1`);
    
    // Decode
    const decoded = codec.decode(encoded);
    console.log('✓ G.711 decoding successful');
    console.log(`  Decoded Size: ${decoded.length} bytes`);
    
    // Verify sizes match
    if (decoded.length === pcmData.length) {
      console.log('✓ PCM data size preserved');
    } else {
      console.log('✗ PCM data size mismatch');
      return false;
    }
    
    return true;
  } catch (error) {
    console.error('✗ G.711 Codec test failed:', error);
    return false;
  }
}

// Test codec conversion
function testCodecConversion() {
  console.log('\nTesting Codec Conversion...');
  
  try {
    // Test μ-law to A-law conversion
    const mulawData = Buffer.alloc(160);
    for (let i = 0; i < 160; i++) {
      mulawData[i] = Math.floor(Math.random() * 256);
    }
    
    const alawData = G711Codec.convertMulawToAlaw(mulawData);
    const backToMulaw = G711Codec.convertAlawToMulaw(alawData);
    
    console.log('✓ Codec conversion successful');
    console.log(`  Original μ-law: ${mulawData.length} bytes`);
    console.log(`  Converted A-law: ${alawData.length} bytes`);
    console.log(`  Back to μ-law: ${backToMulaw.length} bytes`);
    
    return true;
  } catch (error) {
    console.error('✗ Codec conversion test failed:', error);
    return false;
  }
}

// Run all tests
function runAllTests() {
  console.log('Running VoIP Component Tests\n');
  console.log('='.repeat(50));
  
  const tests = [
    { name: 'SIP Message', fn: testSIPMessage },
    { name: 'RTP Packet', fn: testRTPPacket },
    { name: 'G.711 Codec', fn: testG711Codec },
    { name: 'Codec Conversion', fn: testCodecConversion }
  ];
  
  let passed = 0;
  let total = tests.length;
  
  for (const test of tests) {
    console.log(`\n${test.name}:`);
    if (test.fn()) {
      passed++;
    }
  }
  
  console.log('\n' + '='.repeat(50));
  console.log(`Test Results: ${passed}/${total} passed`);
  
  if (passed === total) {
    console.log('🎉 All tests passed! VoIP components are working correctly.');
  } else {
    console.log('❌ Some tests failed. Please check the errors above.');
  }
  
  return passed === total;
}

// Export test functions
export {
  testSIPMessage,
  testRTPPacket,
  testG711Codec,
  testCodecConversion,
  runAllTests
};

// Run tests if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runAllTests();
} 
# VoIP Learning Guide

This guide will help you understand the internals of Voice over IP (VoIP) systems by exploring the components of this project.

## Table of Contents

1. [Introduction to VoIP](#introduction-to-voip)
2. [SIP Protocol Deep Dive](#sip-protocol-deep-dive)
3. [RTP Media Streaming](#rtp-media-streaming)
4. [Audio Codecs](#audio-codecs)
5. [Network Layer](#network-layer)
6. [Call Flow Analysis](#call-flow-analysis)
7. [Hands-on Exercises](#hands-on-exercises)
8. [Troubleshooting](#troubleshooting)

## Introduction to VoIP

Voice over IP (VoIP) is a technology that allows voice communication over IP networks. Unlike traditional circuit-switched telephony, VoIP uses packet-switched networks, which offers several advantages:

- **Cost Efficiency**: Uses existing IP infrastructure
- **Flexibility**: Supports various media types (voice, video, data)
- **Scalability**: Easy to add new features and users
- **Integration**: Can integrate with other IP-based services

### Key Components

1. **Signaling Protocol**: SIP (Session Initiation Protocol) for call setup/teardown
2. **Media Protocol**: RTP (Real-time Transport Protocol) for audio streaming
3. **Audio Codecs**: Compression algorithms for efficient bandwidth usage
4. **Network Transport**: UDP/TCP for packet delivery

## SIP Protocol Deep Dive

SIP (Session Initiation Protocol) is the signaling protocol used to establish, modify, and terminate multimedia sessions.

### SIP Message Structure

```
SIP/2.0 200 OK                    # Status line (response)
Via: SIP/2.0/UDP 192.168.1.100    # Headers
From: <sip:alice@example.com>
To: <sip:bob@example.com>
Call-ID: abc123@192.168.1.100
CSeq: 1 INVITE
Content-Length: 0

# Empty line separates headers from body
# Message body (optional)
```

### SIP Methods

- **INVITE**: Initiate a call
- **ACK**: Confirm call establishment
- **BYE**: Terminate a call
- **CANCEL**: Cancel a pending request
- **REGISTER**: Register with a server
- **OPTIONS**: Query server capabilities

### SIP Responses

- **1xx**: Provisional (100 Trying, 180 Ringing)
- **2xx**: Success (200 OK)
- **3xx**: Redirection (302 Moved Temporarily)
- **4xx**: Client Error (404 Not Found, 486 Busy)
- **5xx**: Server Error (500 Internal Server Error)
- **6xx**: Global Failure (600 Busy Everywhere)

### SIP Transaction States

```
Client Transaction States:
calling → proceeding → terminated
trying → proceeding → terminated

Server Transaction States:
proceeding → confirmed → terminated
```

## RTP Media Streaming

RTP (Real-time Transport Protocol) is used for delivering audio and video over IP networks.

### RTP Packet Structure

```
RTP Header (12 bytes):
+----------------+----------------+
| V=2 |P|X|  CC   |M|     PT      |
+----------------+----------------+
|        sequence number          |
+----------------+----------------+
|           timestamp             |
+----------------+----------------+
|           synchronization source identifier (SSRC)  |
+----------------+----------------+
|            contributing source (CSRC) identifiers   |
|                             ....                    |
+----------------+----------------+
|                payload                               |
+----------------+----------------+
```

### Key RTP Concepts

1. **Sequence Numbers**: Detect packet loss and reordering
2. **Timestamps**: Synchronize audio playback
3. **SSRC**: Identify the source of the stream
4. **Payload Type**: Indicate the codec being used
5. **Marker Bit**: Indicate frame boundaries

### Jitter Buffer

The jitter buffer compensates for network delay variations:

```
Network → Jitter Buffer → Audio Playback
         (50-200ms delay)
```

## Audio Codecs

Audio codecs compress audio data to reduce bandwidth usage.

### G.711 Codec

- **Bit Rate**: 64 kbps
- **Sample Rate**: 8 kHz
- **Compression**: 2:1 (16-bit PCM → 8-bit)
- **Quality**: Good for voice
- **Complexity**: Low

#### μ-law vs A-law

- **μ-law**: Used in North America and Japan
- **A-law**: Used in Europe and most of the world

### Codec Comparison

| Codec | Bit Rate | Quality | Complexity | Use Case |
|-------|----------|---------|------------|----------|
| G.711 | 64 kbps | Good | Low | Traditional VoIP |
| G.729 | 8 kbps | Good | Medium | Bandwidth-constrained |
| G.722 | 64 kbps | Better | Medium | HD Voice |
| Opus | 6-510 kbps | Excellent | High | Modern applications |

## Network Layer

### UDP Transport

UDP is preferred for VoIP because:
- **Low Latency**: No connection establishment
- **Real-time**: No retransmission delays
- **Simplicity**: Less overhead than TCP

### Network Requirements

- **Bandwidth**: 64 kbps per call (G.711)
- **Latency**: < 150ms for good quality
- **Jitter**: < 30ms
- **Packet Loss**: < 1%

### QoS Considerations

- **DiffServ**: Mark packets for priority treatment
- **RSVP**: Reserve bandwidth for calls
- **VLAN**: Separate voice traffic

## Call Flow Analysis

### Basic Call Flow

```
Alice                    Server                    Bob
  |                        |                        |
  |--- INVITE ------------>|                        |
  |                        |--- INVITE ------------>|
  |                        |<-- 180 Ringing --------|
  |<-- 180 Ringing --------|                        |
  |                        |<-- 200 OK -------------|
  |<-- 200 OK -------------|                        |
  |--- ACK --------------->|                        |
  |                        |--- ACK --------------->|
  |                        |                        |
  |<====================== RTP Media ===============>|
  |                        |                        |
  |--- BYE --------------->|                        |
  |                        |--- BYE --------------->|
  |                        |<-- 200 OK -------------|
  |<-- 200 OK -------------|                        |
```

### Registration Flow

```
Client                    Server
  |                        |
  |--- REGISTER ---------->|
  |<-- 200 OK -------------|
  |                        |
```

## Hands-on Exercises

### Exercise 1: Start the Server

```bash
# Install dependencies
npm install

# Start the VoIP server
npm run server
```

### Exercise 2: Use the SIP Debugger

```bash
# In another terminal
node examples/sip-debugger.js
```

### Exercise 3: Make a Test Call

```bash
# Start the client
npm run client
```

### Exercise 4: Analyze SIP Messages

1. Start the server and debugger
2. Make a call
3. Observe the SIP message flow
4. Identify each message type and purpose

### Exercise 5: Examine RTP Packets

1. Use Wireshark to capture RTP traffic
2. Filter for RTP packets: `rtp`
3. Analyze packet headers and payload
4. Calculate jitter and packet loss

### Exercise 6: Codec Testing

```javascript
// Test G.711 encoding/decoding
import { G711Codec } from './src/codecs/g711.js';

const codec = new G711Codec('mulaw');
const pcmData = Buffer.alloc(320); // 160 samples * 2 bytes
const encoded = codec.encode(pcmData);
const decoded = codec.decode(encoded);
```

## Troubleshooting

### Common Issues

1. **Port Already in Use**
   ```bash
   # Check what's using the port
   lsof -i :5060
   
   # Kill the process or use a different port
   ```

2. **SIP Messages Not Received**
   - Check firewall settings
   - Verify network connectivity
   - Ensure correct IP addresses

3. **Audio Quality Issues**
   - Check network latency and jitter
   - Verify codec settings
   - Monitor packet loss

4. **Registration Failures**
   - Check server is running
   - Verify username/password
   - Check network connectivity

### Debugging Tools

1. **SIP Debugger**: Built-in tool for message analysis
2. **Wireshark**: Network packet analysis
3. **sngrep**: SIP message visualization
4. **tcpdump**: Command-line packet capture

### Performance Monitoring

```javascript
// Get server statistics
const stats = server.getStats();
console.log('Server Stats:', stats);

// Get RTP session statistics
const rtpStats = rtpSession.getStats();
console.log('RTP Stats:', rtpStats);
```

## Advanced Topics

### Security

- **SRTP**: Secure RTP for encrypted media
- **SIPS**: Secure SIP over TLS
- **Authentication**: Digest authentication
- **Firewall**: Configure for SIP/RTP

### Scalability

- **Load Balancing**: Distribute calls across servers
- **Clustering**: Multiple server instances
- **Database**: Store user and call data
- **Monitoring**: Track system performance

### Integration

- **WebRTC**: Browser-based VoIP
- **SIP Trunking**: Connect to PSTN
- **IVR**: Interactive Voice Response
- **Recording**: Call recording capabilities

## Next Steps

After completing this guide, you should:

1. **Understand VoIP Fundamentals**: Know how SIP and RTP work
2. **Analyze Call Flows**: Be able to trace SIP message exchanges
3. **Debug Issues**: Use tools to troubleshoot problems
4. **Extend Functionality**: Add new features to the system

### Recommended Reading

- RFC 3261: SIP Specification
- RFC 3550: RTP Specification
- RFC 3551: RTP Profile for Audio and Video
- RFC 4566: SDP Specification

### Practice Projects

1. **Add Video Support**: Implement video codecs and RTP
2. **Build a Web Interface**: Create a web-based phone
3. **Implement Conference Calling**: Multi-party calls
4. **Add Recording**: Call recording functionality
5. **Create a PBX**: Full-featured phone system

Happy learning! 🎤📞 
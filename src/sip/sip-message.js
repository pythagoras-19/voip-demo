/**
 * SIP Message Class
 * Handles parsing and construction of SIP messages
 * 
 * SIP Message Format:
 * - Start line (Request-Line or Status-Line)
 * - Headers
 * - Empty line
 * - Message body (optional)
 */

export class SIPMessage {
  constructor() {
    this.startLine = '';
    this.headers = new Map();
    this.body = '';
    this.method = '';
    this.uri = '';
    this.version = 'SIP/2.0';
    this.statusCode = 0;
    this.reasonPhrase = '';
  }

  /**
   * Parse a raw SIP message string
   */
  static parse(rawMessage) {
    const message = new SIPMessage();
    const lines = rawMessage.split('\r\n');
    
    if (lines.length === 0) {
      throw new Error('Empty SIP message');
    }

    // Parse start line
    message.startLine = lines[0];
    const startLineParts = lines[0].split(' ');
    
    if (startLineParts[0].includes('SIP/')) {
      // Status line (response)
      message.version = startLineParts[0];
      message.statusCode = parseInt(startLineParts[1]);
      message.reasonPhrase = startLineParts.slice(2).join(' ');
    } else {
      // Request line
      message.method = startLineParts[0];
      message.uri = startLineParts[1];
      message.version = startLineParts[2];
    }

    // Parse headers
    let i = 1;
    while (i < lines.length && lines[i] !== '') {
      const line = lines[i];
      const colonIndex = line.indexOf(':');
      
      if (colonIndex > 0) {
        const name = line.substring(0, colonIndex).trim();
        const value = line.substring(colonIndex + 1).trim();
        
        // Handle multi-line headers
        let fullValue = value;
        while (i + 1 < lines.length && 
               (lines[i + 1].startsWith(' ') || lines[i + 1].startsWith('\t'))) {
          i++;
          fullValue += ' ' + lines[i].trim();
        }
        
        message.headers.set(name.toLowerCase(), fullValue);
      }
      i++;
    }

    // Parse body (everything after empty line)
    if (i + 1 < lines.length) {
      message.body = lines.slice(i + 1).join('\r\n');
    }

    return message;
  }

  /**
   * Construct a SIP message string
   */
  toString() {
    let message = '';

    // Start line
    if (this.method) {
      // Request
      message += `${this.method} ${this.uri} ${this.version}\r\n`;
    } else {
      // Response
      message += `${this.version} ${this.statusCode} ${this.reasonPhrase}\r\n`;
    }

    // Headers
    for (const [name, value] of this.headers) {
      message += `${name}: ${value}\r\n`;
    }

    // Empty line
    message += '\r\n';

    // Body
    if (this.body) {
      message += this.body;
    }

    return message;
  }

  /**
   * Get header value
   */
  getHeader(name) {
    return this.headers.get(name.toLowerCase());
  }

  /**
   * Set header value
   */
  setHeader(name, value) {
    this.headers.set(name.toLowerCase(), value);
  }

  /**
   * Check if this is a request
   */
  isRequest() {
    return !!this.method;
  }

  /**
   * Check if this is a response
   */
  isResponse() {
    return !!this.statusCode;
  }

  /**
   * Get call ID
   */
  getCallId() {
    return this.getHeader('call-id');
  }

  /**
   * Get CSeq
   */
  getCSeq() {
    const cseq = this.getHeader('cseq');
    if (cseq) {
      const parts = cseq.split(' ');
      return {
        sequence: parseInt(parts[0]),
        method: parts[1]
      };
    }
    return null;
  }

  /**
   * Get From/To tags
   */
  getTags() {
    const from = this.getHeader('from');
    const to = this.getHeader('to');
    
    const fromTag = from ? this.extractTag(from) : null;
    const toTag = to ? this.extractTag(to) : null;
    
    return { fromTag, toTag };
  }

  /**
   * Extract tag from SIP URI
   */
  extractTag(uri) {
    const tagMatch = uri.match(/tag=([^;>\s]+)/);
    return tagMatch ? tagMatch[1] : null;
  }

  /**
   * Create a response to this message
   */
  createResponse(statusCode, reasonPhrase) {
    const response = new SIPMessage();
    response.version = this.version;
    response.statusCode = statusCode;
    response.reasonPhrase = reasonPhrase;
    
    // Copy relevant headers
    response.setHeader('via', this.getHeader('via'));
    response.setHeader('from', this.getHeader('from'));
    response.setHeader('to', this.getHeader('to'));
    response.setHeader('call-id', this.getHeader('call-id'));
    response.setHeader('cseq', this.getHeader('cseq'));
    
    return response;
  }

  /**
   * Log message for debugging
   */
  log() {
    console.log('=== SIP Message ===');
    console.log(this.toString());
    console.log('==================');
  }
}

// Common SIP methods
export const SIPMethods = {
  INVITE: 'INVITE',
  ACK: 'ACK',
  BYE: 'BYE',
  CANCEL: 'CANCEL',
  REGISTER: 'REGISTER',
  OPTIONS: 'OPTIONS',
  INFO: 'INFO',
  UPDATE: 'UPDATE',
  PRACK: 'PRACK',
  SUBSCRIBE: 'SUBSCRIBE',
  NOTIFY: 'NOTIFY',
  MESSAGE: 'MESSAGE',
  REFER: 'REFER'
};

// Common SIP status codes
export const SIPStatusCodes = {
  // 1xx Provisional
  100: 'Trying',
  180: 'Ringing',
  181: 'Call Is Being Forwarded',
  182: 'Queued',
  183: 'Session Progress',
  
  // 2xx Success
  200: 'OK',
  
  // 3xx Redirection
  300: 'Multiple Choices',
  301: 'Moved Permanently',
  302: 'Moved Temporarily',
  305: 'Use Proxy',
  380: 'Alternative Service',
  
  // 4xx Client Error
  400: 'Bad Request',
  401: 'Unauthorized',
  402: 'Payment Required',
  403: 'Forbidden',
  404: 'Not Found',
  405: 'Method Not Allowed',
  406: 'Not Acceptable',
  407: 'Proxy Authentication Required',
  408: 'Request Timeout',
  409: 'Conflict',
  410: 'Gone',
  411: 'Length Required',
  413: 'Request Entity Too Large',
  414: 'Request-URI Too Long',
  415: 'Unsupported Media Type',
  416: 'Unsupported URI Scheme',
  420: 'Bad Extension',
  421: 'Extension Required',
  423: 'Interval Too Brief',
  480: 'Temporarily Unavailable',
  481: 'Call/Transaction Does Not Exist',
  482: 'Loop Detected',
  483: 'Too Many Hops',
  484: 'Address Incomplete',
  485: 'Ambiguous',
  486: 'Busy Here',
  487: 'Request Terminated',
  488: 'Not Acceptable Here',
  491: 'Request Pending',
  493: 'Undecipherable',
  
  // 5xx Server Error
  500: 'Internal Server Error',
  501: 'Not Implemented',
  502: 'Bad Gateway',
  503: 'Service Unavailable',
  504: 'Server Time-out',
  505: 'Version Not Supported',
  513: 'Message Too Large',
  
  // 6xx Global Failure
  600: 'Busy Everywhere',
  603: 'Decline',
  604: 'Does Not Exist Anywhere',
  606: 'Not Acceptable'
}; 
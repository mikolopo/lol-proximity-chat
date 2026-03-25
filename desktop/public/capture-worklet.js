// capture-worklet.js
// Runs on the audio thread to capture Float32 audio chunks without blocking the UI

class CaptureProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    // 48000Hz / 100 = 480 frames per 10ms chunk
    this.bufferSize = 960; // 20ms chunks (standard for Opus/voice)
    this.buffer = new Float32Array(this.bufferSize);
    this.pointer = 0;
  }

  process(inputs, outputs, parameters) {
    const inputChannels = inputs[0];
    if (inputChannels.length > 0) {
      const channel = inputChannels[0]; // Mono input is fine for voice
      
      for (let i = 0; i < channel.length; i++) {
        this.buffer[this.pointer++] = channel[i];
        
        // When buffer is full, send to main thread and reset
        if (this.pointer >= this.bufferSize) {
          // Send a copy so we can keep writing to our buffer
          this.port.postMessage(new Float32Array(this.buffer));
          this.pointer = 0;
        }
      }
    }
    
    // Keep processor alive
    return true;
  }
}

registerProcessor('capture-processor', CaptureProcessor);

/**
 * RudeMint Animator - Renderer Process
 * Handles all the canvas drawing, animation timeline, and UI interactions
 */

import './index.css';

// Wait for DOM and external scripts to load
window.addEventListener('DOMContentLoaded', () => {
  // Wait for Fabric.js and WaveSurfer to load from CDN
  const checkLibraries = setInterval(() => {
    if (window.fabric && window.WaveSurfer) {
      clearInterval(checkLibraries);
      initializeApp();
    }
  }, 100);
});

function initializeApp() {
  console.log('🎨 RudeMint Animator initializing...');

  // Canvas setup
  const canvas = new window.fabric.Canvas('canvas', {
    backgroundColor: '#ffffff',
  });

  // Timeline setup
  const timelineCanvas = document.getElementById('timeline-canvas');
  const timelineCtx = timelineCanvas.getContext('2d');

  // State
  let currentTool = 'select';
  let fillColor = '#ff0000';
  let strokeColor = '#000000';
  let isPlaying = false;
  let currentFrame = 0;
  let fps = 30;
  let durationBars = 4; // duration in bars
  let bpm = 120;
  let timeSignature = { numerator: 4, denominator: 4 };
  let bpmChanges = new Map(); // bar -> bpm (for tempo automation)
  let maxFrames = calculateMaxFrames(); // calculated dynamically
  let keyframes = new Map(); // frame -> canvas JSON
  let audioPath = null;
  let wavesurfer = null;

  // Calculate max frames based on musical time
  function calculateMaxFrames() {
    const beatsPerBar = timeSignature.numerator;
    const totalBeats = durationBars * beatsPerBar;
    const secondsPerBeat = 60 / bpm;
    const totalSeconds = totalBeats * secondsPerBeat;
    return Math.floor(totalSeconds * fps);
  }

  // Convert frame to musical time
  function frameToMusicalTime(frame) {
    const seconds = frame / fps;
    const beatsPerBar = timeSignature.numerator;
    const secondsPerBeat = 60 / bpm;
    const totalBeats = seconds / secondsPerBeat;
    const bar = Math.floor(totalBeats / beatsPerBar) + 1;
    const beat = Math.floor(totalBeats % beatsPerBar) + 1;
    const subdivision = Math.floor((totalBeats % 1) * 4) + 1; // 16th notes
    return { bar, beat, subdivision, seconds };
  }

  // Convert musical time to frame
  function musicalTimeToFrame(bar, beat, subdivision = 1) {
    const beatsPerBar = timeSignature.numerator;
    const totalBeats = (bar - 1) * beatsPerBar + (beat - 1) + (subdivision - 1) / 4;
    const secondsPerBeat = 60 / bpm;
    const seconds = totalBeats * secondsPerBeat;
    return Math.floor(seconds * fps);
  }

  // Tool selection
  document.getElementById('select-tool').addEventListener('click', () => {
    currentTool = 'select';
    updateToolButtons();
    canvas.isDrawingMode = false;
  });

  document.getElementById('rect-tool').addEventListener('click', () => {
    currentTool = 'rect';
    updateToolButtons();
    canvas.isDrawingMode = false;
  });

  document.getElementById('circle-tool').addEventListener('click', () => {
    currentTool = 'circle';
    updateToolButtons();
    canvas.isDrawingMode = false;
  });

  document.getElementById('line-tool').addEventListener('click', () => {
    currentTool = 'line';
    updateToolButtons();
    canvas.isDrawingMode = false;
  });

  function updateToolButtons() {
    document.querySelectorAll('.tool-btn').forEach(btn => btn.classList.remove('active'));
    document.getElementById(`${currentTool}-tool`).classList.add('active');
  }

  // Color pickers
  document.getElementById('fill-color').addEventListener('change', (e) => {
    fillColor = e.target.value;
  });

  document.getElementById('stroke-color').addEventListener('change', (e) => {
    strokeColor = e.target.value;
  });

  // Drawing functionality
  let isDown = false;
  let origX = 0;
  let origY = 0;
  let currentShape = null;

  canvas.on('mouse:down', (options) => {
    if (currentTool === 'select') return;

    isDown = true;
    const pointer = canvas.getPointer(options.e);
    origX = pointer.x;
    origY = pointer.y;

    if (currentTool === 'rect') {
      currentShape = new window.fabric.Rect({
        left: origX,
        top: origY,
        width: 0,
        height: 0,
        fill: fillColor,
        stroke: strokeColor,
        strokeWidth: 2,
      });
      canvas.add(currentShape);
    } else if (currentTool === 'circle') {
      currentShape = new window.fabric.Circle({
        left: origX,
        top: origY,
        radius: 0,
        fill: fillColor,
        stroke: strokeColor,
        strokeWidth: 2,
      });
      canvas.add(currentShape);
    } else if (currentTool === 'line') {
      currentShape = new window.fabric.Line([origX, origY, origX, origY], {
        stroke: strokeColor,
        strokeWidth: 2,
      });
      canvas.add(currentShape);
    }
  });

  canvas.on('mouse:move', (options) => {
    if (!isDown || currentTool === 'select') return;

    const pointer = canvas.getPointer(options.e);

    if (currentTool === 'rect') {
      currentShape.set({
        width: Math.abs(pointer.x - origX),
        height: Math.abs(pointer.y - origY),
        left: Math.min(pointer.x, origX),
        top: Math.min(pointer.y, origY),
      });
    } else if (currentTool === 'circle') {
      const radius = Math.sqrt(Math.pow(pointer.x - origX, 2) + Math.pow(pointer.y - origY, 2));
      currentShape.set({
        radius: radius,
        left: origX - radius,
        top: origY - radius
      });
    } else if (currentTool === 'line') {
      currentShape.set({ x2: pointer.x, y2: pointer.y });
    }

    canvas.renderAll();
  });

  canvas.on('mouse:up', () => {
    isDown = false;
    currentShape = null;
  });

  // Keyframe management
  document.getElementById('add-keyframe-btn').addEventListener('click', () => {
    const canvasState = JSON.stringify(canvas.toJSON());
    keyframes.set(currentFrame, canvasState);
    drawTimeline();
    alert(`Keyframe added at frame ${currentFrame}`);
  });

  // Audio import
  document.getElementById('import-audio-btn').addEventListener('click', async () => {
    const path = await window.electronAPI.importAudio();
    if (path) {
      audioPath = path;
      loadAudio(path);
    }
  });

  function loadAudio(path) {
    if (wavesurfer) {
      wavesurfer.destroy();
    }

    wavesurfer = window.WaveSurfer.create({
      container: '#waveform',
      waveColor: '#4a9eff',
      progressColor: '#1e3a8a',
      height: 80,
    });

    wavesurfer.load(path);

    wavesurfer.on('audioprocess', () => {
      if (isPlaying) {
        currentFrame = Math.floor(wavesurfer.getCurrentTime() * fps);
        updateCurrentTime();
        interpolateFrame(currentFrame);
      }
    });
  }

  // Playback controls
  document.getElementById('rewind-btn').addEventListener('click', () => {
    isPlaying = false;
    if (wavesurfer) {
      wavesurfer.pause();
    }
    currentFrame = 0;
    interpolateFrame(currentFrame);
    updateCurrentTime();
    drawTimeline();
  });

  document.getElementById('play-btn').addEventListener('click', () => {
    isPlaying = true;
    if (wavesurfer) {
      wavesurfer.play();
    } else {
      startAnimation();
    }
  });

  document.getElementById('pause-btn').addEventListener('click', () => {
    isPlaying = false;
    if (wavesurfer) {
      wavesurfer.pause();
    }
  });

  document.getElementById('stop-btn').addEventListener('click', () => {
    isPlaying = false;
    if (wavesurfer) {
      wavesurfer.pause();
      wavesurfer.seekTo(0);
    }
    currentFrame = 0;
    interpolateFrame(currentFrame);
    updateCurrentTime();
    drawTimeline();
  });

  function startAnimation() {
    if (!isPlaying) return;

    currentFrame++;

    // Stop if we've reached the end
    if (currentFrame > maxFrames) {
      isPlaying = false;
      currentFrame = maxFrames;
      updateCurrentTime();
      drawTimeline();
      return;
    }

    interpolateFrame(currentFrame);
    updateCurrentTime();

    setTimeout(() => startAnimation(), 1000 / fps);
  }

  function interpolateFrame(frame) {
    // Find closest keyframes
    const frames = Array.from(keyframes.keys()).sort((a, b) => a - b);

    if (frames.length === 0) return;

    let prevFrame = frames[0];
    let nextFrame = frames[frames.length - 1];

    for (let i = 0; i < frames.length; i++) {
      if (frames[i] <= frame) prevFrame = frames[i];
      if (frames[i] > frame && frames[i] < nextFrame) {
        nextFrame = frames[i];
      }
    }

    // If we're exactly on a keyframe, just show it
    if (prevFrame === frame) {
      canvas.loadFromJSON(keyframes.get(prevFrame), () => canvas.renderAll());
      return;
    }

    // If there's no next keyframe, just show the previous one
    if (prevFrame === nextFrame || nextFrame <= frame) {
      canvas.loadFromJSON(keyframes.get(prevFrame), () => canvas.renderAll());
      return;
    }

    // Interpolate between keyframes
    const prevState = JSON.parse(keyframes.get(prevFrame));
    const nextState = JSON.parse(keyframes.get(nextFrame));

    // Calculate interpolation factor (0 to 1)
    const t = (frame - prevFrame) / (nextFrame - prevFrame);

    // Create interpolated state
    const interpolatedState = {
      ...prevState,
      objects: prevState.objects.map((prevObj, index) => {
        const nextObj = nextState.objects[index];
        if (!nextObj) return prevObj;

        // Interpolate properties
        const interpolated = { ...prevObj };

        // Interpolate position
        if (prevObj.left !== undefined && nextObj.left !== undefined) {
          interpolated.left = prevObj.left + (nextObj.left - prevObj.left) * t;
        }
        if (prevObj.top !== undefined && nextObj.top !== undefined) {
          interpolated.top = prevObj.top + (nextObj.top - prevObj.top) * t;
        }

        // Interpolate size
        if (prevObj.width !== undefined && nextObj.width !== undefined) {
          interpolated.width = prevObj.width + (nextObj.width - prevObj.width) * t;
        }
        if (prevObj.height !== undefined && nextObj.height !== undefined) {
          interpolated.height = prevObj.height + (nextObj.height - prevObj.height) * t;
        }
        if (prevObj.radius !== undefined && nextObj.radius !== undefined) {
          interpolated.radius = prevObj.radius + (nextObj.radius - prevObj.radius) * t;
        }

        // Interpolate rotation
        if (prevObj.angle !== undefined && nextObj.angle !== undefined) {
          interpolated.angle = prevObj.angle + (nextObj.angle - prevObj.angle) * t;
        }

        // Interpolate scale
        if (prevObj.scaleX !== undefined && nextObj.scaleX !== undefined) {
          interpolated.scaleX = prevObj.scaleX + (nextObj.scaleX - prevObj.scaleX) * t;
        }
        if (prevObj.scaleY !== undefined && nextObj.scaleY !== undefined) {
          interpolated.scaleY = prevObj.scaleY + (nextObj.scaleY - prevObj.scaleY) * t;
        }

        // Interpolate opacity
        if (prevObj.opacity !== undefined && nextObj.opacity !== undefined) {
          interpolated.opacity = prevObj.opacity + (nextObj.opacity - prevObj.opacity) * t;
        }

        return interpolated;
      })
    };

    canvas.loadFromJSON(interpolatedState, () => canvas.renderAll());
  }

  function updateCurrentTime() {
    const musicalTime = frameToMusicalTime(currentFrame);
    const timeDisplay = document.getElementById('current-time');
    if (timeDisplay) {
      timeDisplay.textContent = `${musicalTime.bar}.${musicalTime.beat}.${musicalTime.subdivision} (${musicalTime.seconds.toFixed(2)}s)`;
    }
  }

  // FPS input
  document.getElementById('fps-input').addEventListener('change', (e) => {
    fps = parseInt(e.target.value);
    maxFrames = calculateMaxFrames();
    drawTimeline();
  });

  // Duration input (now in bars)
  document.getElementById('duration-input').addEventListener('change', (e) => {
    durationBars = parseInt(e.target.value);
    maxFrames = calculateMaxFrames();
    drawTimeline();
  });

  // BPM input
  document.getElementById('bpm-input').addEventListener('change', (e) => {
    bpm = parseFloat(e.target.value);
    maxFrames = calculateMaxFrames();
    updateCurrentTime();
    drawTimeline();
  });

  // Time signature inputs
  document.getElementById('time-sig-numerator').addEventListener('change', (e) => {
    timeSignature.numerator = parseInt(e.target.value);
    maxFrames = calculateMaxFrames();
    updateCurrentTime();
    drawTimeline();
  });

  document.getElementById('time-sig-denominator').addEventListener('change', (e) => {
    timeSignature.denominator = parseInt(e.target.value);
    maxFrames = calculateMaxFrames();
    updateCurrentTime();
    drawTimeline();
  });

  // Add BPM change
  document.getElementById('add-bpm-change-btn').addEventListener('click', () => {
    const musicalTime = frameToMusicalTime(currentFrame);
    const newBPM = parseFloat(prompt(`Add BPM change at bar ${musicalTime.bar}.\nEnter new BPM:`, bpm));
    if (newBPM && !isNaN(newBPM) && newBPM > 0) {
      bpmChanges.set(musicalTime.bar, newBPM);
      drawTimeline();
      alert(`BPM change to ${newBPM} added at bar ${musicalTime.bar}`);
    }
  });

  // Timeline drawing
  function drawTimeline() {
    timelineCtx.clearRect(0, 0, timelineCanvas.width, timelineCanvas.height);

    // Draw musical time markers (bars and beats)
    const beatsPerBar = timeSignature.numerator;
    const totalBars = durationBars;

    for (let bar = 1; bar <= totalBars; bar++) {
      for (let beat = 1; beat <= beatsPerBar; beat++) {
        const frame = musicalTimeToFrame(bar, beat);
        if (frame > maxFrames) continue;

        const x = (frame / maxFrames) * timelineCanvas.width;

        // Bar markers are thicker and black
        if (beat === 1) {
          timelineCtx.strokeStyle = '#000';
          timelineCtx.lineWidth = 2;
          timelineCtx.beginPath();
          timelineCtx.moveTo(x, 0);
          timelineCtx.lineTo(x, 30);
          timelineCtx.stroke();

          // Bar number label
          timelineCtx.fillStyle = '#000';
          timelineCtx.font = '10px monospace';
          timelineCtx.fillText(bar.toString(), x + 2, 10);
        } else {
          // Beat markers are thinner and gray
          timelineCtx.strokeStyle = '#999';
          timelineCtx.lineWidth = 1;
          timelineCtx.beginPath();
          timelineCtx.moveTo(x, 0);
          timelineCtx.lineTo(x, 15);
          timelineCtx.stroke();
        }

        // Draw 16th note subdivisions
        for (let sub = 2; sub <= 4; sub++) {
          const subFrame = musicalTimeToFrame(bar, beat, sub);
          if (subFrame > maxFrames) continue;
          const subX = (subFrame / maxFrames) * timelineCanvas.width;
          timelineCtx.strokeStyle = '#ddd';
          timelineCtx.lineWidth = 1;
          timelineCtx.beginPath();
          timelineCtx.moveTo(subX, 0);
          timelineCtx.lineTo(subX, 8);
          timelineCtx.stroke();
        }
      }
    }

    // Draw BPM changes
    bpmChanges.forEach((changeBPM, bar) => {
      const frame = musicalTimeToFrame(bar, 1);
      if (frame > maxFrames) return;
      const x = (frame / maxFrames) * timelineCanvas.width;

      timelineCtx.fillStyle = '#ff9900';
      timelineCtx.beginPath();
      timelineCtx.moveTo(x, 35);
      timelineCtx.lineTo(x - 5, 45);
      timelineCtx.lineTo(x + 5, 45);
      timelineCtx.closePath();
      timelineCtx.fill();

      // BPM label
      timelineCtx.fillStyle = '#ff9900';
      timelineCtx.font = '9px monospace';
      timelineCtx.fillText(`${changeBPM}`, x - 10, 55);
    });

    // Draw keyframes
    keyframes.forEach((_, frame) => {
      const x = (frame / maxFrames) * timelineCanvas.width;
      timelineCtx.fillStyle = '#ff0000';
      timelineCtx.beginPath();
      timelineCtx.arc(x, 65, 5, 0, Math.PI * 2);
      timelineCtx.fill();
    });

    // Draw playhead
    const playheadX = (currentFrame / maxFrames) * timelineCanvas.width;
    timelineCtx.strokeStyle = '#0000ff';
    timelineCtx.lineWidth = 2;
    timelineCtx.beginPath();
    timelineCtx.moveTo(playheadX, 0);
    timelineCtx.lineTo(playheadX, timelineCanvas.height);
    timelineCtx.stroke();
  }

  // Timeline scrubbing
  timelineCanvas.addEventListener('click', (e) => {
    const rect = timelineCanvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    currentFrame = Math.floor((x / timelineCanvas.width) * maxFrames);
    interpolateFrame(currentFrame);
    updateCurrentTime();
    drawTimeline();
  });

  // Export video
  document.getElementById('export-btn').addEventListener('click', async () => {
    if (keyframes.size === 0) {
      alert('Please add at least one keyframe before exporting');
      return;
    }

    alert('Generating frames... This may take a moment.');

    const frames = [];
    const maxFrame = Math.max(...Array.from(keyframes.keys()));

    for (let i = 0; i <= maxFrame; i++) {
      interpolateFrame(i);
      const dataURL = canvas.toDataURL('image/png');
      frames.push(dataURL);
    }

    try {
      const result = await window.electronAPI.exportVideo({
        frames,
        audioPath,
        fps,
        width: canvas.width,
        height: canvas.height,
      });

      if (result) {
        alert(`Video exported successfully to: ${result}`);
      }
    } catch (error) {
      alert(`Export failed: ${error}`);
    }
  });

  // Initialize timeline
  drawTimeline();
  setInterval(drawTimeline, 100);

  console.log('✅ RudeMint Animator ready!');
}

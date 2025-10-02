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
  let keyframes = new Map(); // frame -> canvas JSON
  let audioPath = null;
  let wavesurfer = null;

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
    const time = (currentFrame / fps).toFixed(2);
    const timeDisplay = document.getElementById('current-time');
    if (timeDisplay) timeDisplay.textContent = `${time}s`;
  }

  // FPS input
  document.getElementById('fps-input').addEventListener('change', (e) => {
    fps = parseInt(e.target.value);
  });

  // Timeline drawing
  function drawTimeline() {
    timelineCtx.clearRect(0, 0, timelineCanvas.width, timelineCanvas.height);

    // Draw frame markers
    for (let i = 0; i < 300; i++) {
      const x = (i / 300) * timelineCanvas.width;
      timelineCtx.strokeStyle = i % 30 === 0 ? '#000' : '#ccc';
      timelineCtx.lineWidth = i % 30 === 0 ? 2 : 1;
      timelineCtx.beginPath();
      timelineCtx.moveTo(x, 0);
      timelineCtx.lineTo(x, i % 30 === 0 ? 20 : 10);
      timelineCtx.stroke();
    }

    // Draw keyframes
    keyframes.forEach((_, frame) => {
      const x = (frame / 300) * timelineCanvas.width;
      timelineCtx.fillStyle = '#ff0000';
      timelineCtx.beginPath();
      timelineCtx.arc(x, 30, 5, 0, Math.PI * 2);
      timelineCtx.fill();
    });

    // Draw playhead
    const playheadX = (currentFrame / 300) * timelineCanvas.width;
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
    currentFrame = Math.floor((x / timelineCanvas.width) * 300);
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

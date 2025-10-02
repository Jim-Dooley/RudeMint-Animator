const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('node:path');
const { spawn } = require('child_process');
const fs = require('fs');

// Handle creating/removing shortcuts on Windows when installing/uninstalling.
if (require('electron-squirrel-startup')) {
  app.quit();
}

const createWindow = () => {
  // Create the browser window.
  const mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    webPreferences: {
      preload: MAIN_WINDOW_PRELOAD_WEBPACK_ENTRY,
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  // Set CSP to allow CDN scripts
  mainWindow.webContents.session.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': ["default-src 'self'; script-src 'self' https://cdnjs.cloudflare.com https://unpkg.com 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'"]
      }
    });
  });

  // and load the index.html of the app.
  mainWindow.loadURL(MAIN_WINDOW_WEBPACK_ENTRY);

  // Open the DevTools.
  mainWindow.webContents.openDevTools();
};

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.whenReady().then(() => {
  createWindow();

  // On OS X it's common to re-create a window in the app when the
  // dock icon is clicked and there are no other windows open.
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// Handle audio file import
ipcMain.handle('import-audio', async () => {
  const result = await dialog.showOpenDialog({
    properties: ['openFile'],
    filters: [
      { name: 'Audio Files', extensions: ['mp3', 'wav', 'ogg', 'm4a'] }
    ]
  });

  if (!result.canceled && result.filePaths.length > 0) {
    return result.filePaths[0];
  }
  return null;
});

// Handle MP4 export using FFmpeg
ipcMain.handle('export-video', async (event, { frames, audioPath, fps, width, height }) => {
  const { filePath } = await dialog.showSaveDialog({
    defaultPath: 'animation.mp4',
    filters: [{ name: 'Video Files', extensions: ['mp4'] }]
  });

  if (!filePath) return null;

  // Create temporary directory for frames
  const tempDir = path.join(app.getPath('temp'), 'rudemint-frames');
  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true });
  }

  // Save frames as images
  frames.forEach((frameData, index) => {
    const base64Data = frameData.replace(/^data:image\/png;base64,/, '');
    fs.writeFileSync(
      path.join(tempDir, `frame_${String(index).padStart(5, '0')}.png`),
      base64Data,
      'base64'
    );
  });

  // Build FFmpeg command
  const ffmpegArgs = [
    '-framerate', fps.toString(),
    '-i', path.join(tempDir, 'frame_%05d.png'),
  ];

  if (audioPath) {
    ffmpegArgs.push('-i', audioPath);
    ffmpegArgs.push('-c:a', 'aac');
    ffmpegArgs.push('-shortest');
  }

  ffmpegArgs.push(
    '-c:v', 'libx264',
    '-pix_fmt', 'yuv420p',
    '-y',
    filePath
  );

  return new Promise((resolve, reject) => {
    const ffmpeg = spawn('ffmpeg', ffmpegArgs);

    ffmpeg.on('error', (err) => {
      // Cleanup temp files
      try {
        fs.readdirSync(tempDir).forEach(file => {
          fs.unlinkSync(path.join(tempDir, file));
        });
        fs.rmdirSync(tempDir);
      } catch (e) {
        console.error('Cleanup error:', e);
      }

      if (err.code === 'ENOENT') {
        reject(new Error('FFmpeg is not installed. Please install FFmpeg and add it to your system PATH.\n\nDownload from: https://ffmpeg.org/download.html\n\nFor Windows: Download, extract, and add the bin folder to your PATH environment variable.'));
      } else {
        reject(err);
      }
    });

    ffmpeg.on('close', (code) => {
      // Cleanup temp files
      try {
        fs.readdirSync(tempDir).forEach(file => {
          fs.unlinkSync(path.join(tempDir, file));
        });
        fs.rmdirSync(tempDir);
      } catch (e) {
        console.error('Cleanup error:', e);
      }

      if (code === 0) {
        resolve(filePath);
      } else {
        reject(new Error(`FFmpeg exited with code ${code}`));
      }
    });

    ffmpeg.stderr.on('data', (data) => {
      console.log(`FFmpeg: ${data}`);
    });
  });
});

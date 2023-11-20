import './index.css';
import { ipcRenderer } from 'electron';
import { writeFile } from 'fs';

const videoElement = document.querySelector('video');
const startBtn = document.getElementById('startBtn');
const stopBtn = document.getElementById('stopBtn');
const selectMenu = document.getElementById('selectMenu');

let mediaRecorder;
let recordedChunks = [];

startBtn.addEventListener('click', startRecording);
stopBtn.addEventListener('click', stopRecording);
selectMenu.addEventListener('change', showLiveFeed);

startBtn.disabled = true;
stopBtn.disabled = true;

getVideoSources();

async function getVideoSources() {
  try {
    const loadingOption = createOption('Loading');
    selectMenu.appendChild(loadingOption);

    const inputSources = await ipcRenderer.invoke('getSources');

    selectMenu.removeChild(loadingOption);

    inputSources.forEach((source) => {
      const option = createOption(source.name, source.id);
      selectMenu.appendChild(option);
    });

    await showLiveFeed();

    startBtn.disabled = false;
  } catch (error) {
    console.error('Error getting video sources:', error);
  }
}

function createOption(text, value = '') {
  const option = document.createElement('option');
  option.textContent = text;
  option.value = value;
  return option;
}

async function showLiveFeed() {
  try {
    const stream = await getUserMediaStream();
    videoElement.srcObject = stream;
    await videoElement.play();
  } catch (error) {
    console.error('Error showing live feed:', error);
  }
}

async function startRecording() {
  const screenId = selectMenu.options[selectMenu.selectedIndex].value;

  try {
    startBtn.disabled = true;
    stopBtn.disabled = false;
    selectMenu.disabled = true;

    const NOTIFICATION_TITLE = 'Recording Started';

    new window.Notification(NOTIFICATION_TITLE);

    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
      mediaRecorder.stop();
    }

    const IS_MACOS =
      (await ipcRenderer.invoke('getOperatingSystem')) === 'darwin';
    const audioConstraints = !IS_MACOS
      ? { mandatory: { chromeMediaSource: 'desktop' } }
      : false;

    const constraints = {
      audio: audioConstraints,
      video: {
        mandatory: {
          chromeMediaSource: 'desktop',
          chromeMediaSourceId: screenId
        }
      }
    };

    startBtn.innerText = 'Recording';

    const stream = await navigator.mediaDevices.getUserMedia(constraints);

    mediaRecorder = new MediaRecorder(stream);
    mediaRecorder.ondataavailable = onDataAvailable;
    mediaRecorder.onstop = stopRecording;
    mediaRecorder.start();
  } catch (error) {
    console.error('Error starting recording:', error);
    const NOTIFICATION_TITLE = 'Error';
    const NOTIFICATION_BODY = error;

    new window.Notification(NOTIFICATION_TITLE, {
      body: NOTIFICATION_BODY
    });

    resetRecordingState();
  }
}

function onDataAvailable(e) {
  if (e.data.size > 0) {
    recordedChunks.push(e.data);
  }
}

async function stopRecording() {
  startBtn.disabled = false;
  stopBtn.disabled = true;
  selectMenu.disabled = false;

  startBtn.innerText = 'Record';

  if (mediaRecorder && mediaRecorder.state !== 'inactive') {
    mediaRecorder.stop();
  }

  videoElement.srcObject = null;

  const blob = new Blob(recordedChunks, {
    type: 'video/webm'
  });

  const buffer = Buffer.from(await blob.arrayBuffer());
  recordedChunks = [];

  try {
    const { canceled, filePath } = await ipcRenderer.invoke('showSaveDialog');
    if (!canceled && filePath) {
      writeFile(filePath, buffer, () => {
        const NOTIFICATION_TITLE = 'Saved Recording';

        new window.Notification(NOTIFICATION_TITLE);
      });
    }
  } catch (error) {
    console.error('Error saving video:', error);
  } finally {
    resetRecordingState();
    showLiveFeed();

    location.reload();
  }
}

async function getUserMediaStream() {
  try {
    const screenId = selectMenu.value;
    const IS_MACOS =
      (await ipcRenderer.invoke('getOperatingSystem')) === 'darwin';
    const audioConstraints = !IS_MACOS
      ? { mandatory: { chromeMediaSource: 'desktop' } }
      : false;
    const videoConstraints = {
      audio: audioConstraints,
      video: {
        mandatory: {
          chromeMediaSource: 'desktop',
          chromeMediaSourceId: screenId
        }
      }
    };

    return await navigator.mediaDevices.getUserMedia(videoConstraints);
  } catch (error) {
    console.error('Error getting user media stream:', error);
    throw error;
  }
}

function resetRecordingState() {
  startBtn.innerText = 'Record';
  recordedChunks = [];
  if (mediaRecorder) {
    mediaRecorder.ondataavailable = null;
    mediaRecorder.onstop = null;
  }
}

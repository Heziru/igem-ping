'use strict';

const { contextBridge, ipcRenderer } = require('electron');

// Keep Electron and the IPC event object inside this isolated preload.
function subscribe(channel, callback) {
  if (typeof callback !== 'function') throw new TypeError('A callback is required.');
  const listener = (_event, payload) => callback(payload);
  ipcRenderer.on(channel, listener);
  return () => ipcRenderer.removeListener(channel, listener);
}

contextBridge.exposeInMainWorld('igem', Object.freeze({
  getState: () => ipcRenderer.invoke('igem:get-state'),
  updateSettings: (patch) => ipcRenderer.invoke('igem:update-settings', patch),
  openWheel: () => ipcRenderer.invoke('igem:open-wheel'),
  ping: (id) => ipcRenderer.invoke('igem:ping', id),
  closeWheel: () => ipcRenderer.invoke('igem:close-wheel'),
  showSettings: () => ipcRenderer.invoke('igem:show-settings'),
  openLink: (key) => ipcRenderer.invoke('igem:open-link', key),
  startTimer: (minutes) => ipcRenderer.invoke('igem:start-timer', minutes),
  stopTimer: () => ipcRenderer.invoke('igem:stop-timer'),
  quit: () => ipcRenderer.invoke('igem:quit'),
  dragStart: () => ipcRenderer.send('igem:drag-start'),
  dragMove: () => ipcRenderer.send('igem:drag-move'),
  dragEnd: () => ipcRenderer.send('igem:drag-end'),
  setPetInteractive: (interactive) => {
    if (typeof interactive === 'boolean') ipcRenderer.send('igem:pet-interactive', interactive);
  },
  onState: (callback) => subscribe('igem:state', callback),
  onWheel: (callback) => subscribe('igem:wheel', callback),
  onPet: (callback) => subscribe('igem:pet', callback),
}));

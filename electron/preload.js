const { contextBridge, ipcRenderer } = require('electron')

/**
 * Expose protected methods to the renderer process via contextBridge.
 * This allows the React app to communicate with the main process
 * without exposing the full Node.js/Electron API.
 */
contextBridge.exposeInMainWorld('electronAPI', {
  /**
   * Open the customer display window on the second monitor
   */
  openCustomerDisplay: () => ipcRenderer.invoke('open-customer-display'),

  /**
   * Send cart data to the customer display window
   * @param {string} cartJson - JSON string of the cart data
   */
  updateCustomerDisplay: (cartJson) =>
    ipcRenderer.invoke('update-customer-display', cartJson),

  /**
   * Listen for cart updates (used by the customer display window)
   * @param {Function} callback - Called with cart JSON data when updated
   * @returns {Function} Cleanup function to remove the listener
   */
  onCartUpdate: (callback) => {
    const handler = (_event, cartJson) => callback(cartJson)
    ipcRenderer.on('cart-update', handler)
    // Return cleanup function
    return () => ipcRenderer.removeListener('cart-update', handler)
  },

  /**
   * Quit application cleanly
   */
  quitApp: () => ipcRenderer.invoke('quit-app'),

  /**
   * Minimize window
   */
  minimizeApp: () => ipcRenderer.invoke('minimize-app'),

  /**
   * Toggle window fullscreen state
   */
  toggleFullscreen: () => ipcRenderer.invoke('toggle-fullscreen'),

  /**
   * Flag indicating we're in Electron environment
   */
  isElectron: true,
})

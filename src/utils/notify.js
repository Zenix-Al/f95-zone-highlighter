// utils/notify.js
export function notify(title, body) {
  if (!('Notification' in window)) return;
  if (Notification.permission === 'granted') {
    new Notification(title, { body });
  } else if (Notification.permission !== 'denied') {
    Notification.requestPermission().then(permission => {
      if (permission === 'granted') new Notification(title, { body });
    });
  }
}

export function notifyAllDone() {
  notify('Images Reloaded', '✅ All images have finished reloading.');
}

export function notifyMaxAttempts(max) {
  notify('Reload Warning', `⚠️ Some images failed to reload after ${max} attempts. You may need to refresh.`);
}

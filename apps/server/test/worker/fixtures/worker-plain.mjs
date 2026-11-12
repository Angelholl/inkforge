/* global process, setInterval */
process.send?.({ type: 'ready' });
setInterval(() => {}, 1e6);

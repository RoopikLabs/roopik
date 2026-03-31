let isTtsEnabled = false;
export const setTtsEnabled = (enabled) => (isTtsEnabled = enabled);
let speed = 1.0;
export const setTtsSpeed = (newSpeed) => (speed = newSpeed);
let sayInstance = undefined;
let queue = [];
export const playTts = async (message, options = {}) => {
    if (!isTtsEnabled) {
        return;
    }
    try {
        queue.push({ message, options });
        await processQueue();
    }
    catch (error) { }
};
export const stopTts = () => {
    sayInstance?.stop();
    sayInstance = undefined;
    queue = [];
};
const processQueue = async () => {
    if (!isTtsEnabled || sayInstance) {
        return;
    }
    const item = queue.shift();
    if (!item) {
        return;
    }
    try {
        const { message: nextUtterance, options } = item;
        await new Promise((resolve, reject) => {
            const say = require("say");
            sayInstance = say;
            options.onStart?.();
            say.speak(nextUtterance, undefined, speed, (err) => {
                options.onStop?.();
                if (err) {
                    reject(new Error(err));
                }
                else {
                    resolve();
                }
                sayInstance = undefined;
            });
        });
        await processQueue();
    }
    catch (error) {
        sayInstance = undefined;
        await processQueue();
    }
};
//# sourceMappingURL=tts.js.map
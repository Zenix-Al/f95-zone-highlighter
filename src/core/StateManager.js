// src/core/StateManager.js

/**
 * Gets a nested property from an object using a dot-notation path.
 * @param {object} obj The object to query.
 * @param {string} path The path to the property (e.g., 'a.b.c').
 * @returns {*} The value of the property, or undefined if not found.
 */
const getByPath = (obj, path) => {
    if (typeof path !== 'string') return undefined;
    return path.split('.').reduce((acc, part) => acc && acc[part], obj);
};

/**
 * Sets a nested property on an object using a dot-notation path.
 * @param {object} obj The object to modify.
 * @param {string} path The path to the property (e.g., 'a.b.c').
 * @param {*} value The value to set.
 */
const setByPath = (obj, path, value) => {
    if (typeof path !== 'string') return;
    const keys = path.split('.');
    const lastKey = keys.pop();
    const target = keys.reduce((acc, part) => {
        acc[part] = acc[part] || {};
        return acc[part];
    }, obj);
    if (target) {
        target[lastKey] = value;
    }
};

/**
 * Creates a state management instance.
 * @param {object} initialState The initial state.
 * @returns {object} A state manager with get, set, and subscribe methods.
 */
const createStateManager = (initialState = {}) => {
    let state = JSON.parse(JSON.stringify(initialState)); // Deep copy
    const subscriptions = new Map();

    const get = (path) => getByPath(state, path);

    const set = (path, value) => {
        setByPath(state, path, value);
        // Notify subscribers for this path and its parents
        const pathParts = path.split('.');
        for (let i = 1; i <= pathParts.length; i++) {
            const currentPath = pathParts.slice(0, i).join('.');
            if (subscriptions.has(currentPath)) {
                subscriptions.get(currentPath).forEach(callback => callback(get(currentPath)));
            }
        }
    };

    const subscribe = (path, callback) => {
        if (!subscriptions.has(path)) {
            subscriptions.set(path, new Set());
        }
        subscriptions.get(path).add(callback);

        // Return an unsubscribe function
        return () => {
            subscriptions.get(path).delete(callback);
            if (subscriptions.get(path).size === 0) {
                subscriptions.delete(path);
            }
        };
    };
    
    const getState = () => JSON.parse(JSON.stringify(state));

    return {
        get,
        set,
        subscribe,
        getState, // For debugging or getting a full snapshot
    };
};

export default createStateManager;
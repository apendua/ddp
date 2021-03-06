/** @module utils/storage */

const items = new WeakMap();
const { hasOwnProperty } = Object.prototype;
const has = (obj, key) => hasOwnProperty.call(obj, key);

/**
 * Interface for key/ value store.
 * @interface Storage
 */

/**
 * Get value at the given key.
 * @function
 * @name Storage#get
 * @param {string} key
 * @returns {Promise}
 */

/**
 * Set value at the given key.
 * @function
 * @name Storage#set
 * @param {string} key
 * @param {any} value
 * @returns {Promise}
 */

/**
 * Delete value at the given key.
 * @function
 * @name Storage#del
 * @param {string} key
 * @returns {Promise}
 */

/**
 * Implements a trivial in-memory-storage that can be used
 * as a fallback if no other storage is available.
 * @private
 * @class
 * @implements {Storage}
 */
class Storage {
  constructor() {
    items.set(this, {});
  }

  set(key, value) {
    items.get(this)[key] = value;
    return Promise.resolve();
  }

  del(key) {
    delete items.get(this)[key];
    return Promise.resolve();
  }

  get(key) {
    const obj = items.get(this);
    if (!has(obj, key)) {
      return Promise.reject(new Error(`No such key: ${key}`));
    }
    return Promise.resolve(obj[key]);
  }
}

export default Storage;

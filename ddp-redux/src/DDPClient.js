import mapValues from 'lodash/mapValues';
import DDPSocket from './DDPSocket';
import DDPEmitter from './DDPEmitter';
import DDPError from './DDPError';
import Storage from './utils/Storage';
import carefullyMapValues from './utils/carefullyMapValues';

import { DEFAULT_SOCKET_ID } from './constants';

import * as collections from './modules/collections';
import * as connection from './modules/connection';
import * as currentUser from './modules/currentUser';
import * as messages from './modules/messages';
import * as methods from './modules/methods';
import * as queries from './modules/queries';
import * as subscriptions from './modules/subscriptions';
import * as wrapWithPromise from './modules/wrapWithPromise';
import * as thunk from './modules/thunk';
import {
  callMethod,
  queryUpdate,
} from './actions';

/**
 * @class
 */
class DDPClient extends DDPEmitter {
  /**
   * Creates an instance of DDPClient.
   * @param {string} endpoint
   * @param {function} SocketConstructor
   * @param {module:utils/storage~Storage} storage
   * @param {function} getStorageKey
   */
  constructor({
    endpoint,
    SocketConstructor,
    storage = new Storage(),
    getStorageKey = socket => socket.endpoint,
    onPromise,
  } = {}) {
    super();
    this.SocketConstructor = SocketConstructor;
    this.sockets = {};
    this.counter = 0;
    this.defaultEndpoint = endpoint;
    this.storage = storage;
    this.getStorageKey = getStorageKey;
    this.onPromise = onPromise;
  }

  send(msg, { socketId = DEFAULT_SOCKET_ID } = {}) {
    const socket = this.sockets[socketId];
    if (socket) {
      socket.send(msg);
    }
  }

  open(endpoint, { socketId = DEFAULT_SOCKET_ID } = {}) {
    if (this.sockets[socketId]) {
      throw new Error('Already opened, you need to close connection first.');
    }
    const socket = new DDPSocket({
      SocketConstructor: this.SocketConstructor,
    });
    this.sockets[socketId] = socket;
    socket.on('message', (msg) => {
      this.emit('message', msg, {
        socketId,
      });
    });
    socket.on('open', () => {
      this.emit('open', { socketId });
    });
    socket.on('close', () => {
      this.emit('close', { socketId });
      setTimeout(() => {
        if (this.sockets[socketId]) {
          // NOTE: This means, socket was not closed intentionally, so we try to reconnect after 5 seconds.
          //       Before we do it, we need to delete it, because otherwise a "duplicate" error will be thrown.
          delete this.sockets[socketId];
          this.open(endpoint, { socketId });
        }
      }, 5000);
    });
    socket.open(endpoint);
    return socketId;
  }

  close({ socketId = DEFAULT_SOCKET_ID } = {}) {
    const socket = this.sockets[socketId];
    if (socket) {
      delete this.sockets[socketId];
      socket.close();
    }
  }

  fetch(name, params, properties = {}) {
    return this.constructor.fetch(name, params, properties);
  }

  clearResumeToken(socket) {
    return Promise.resolve(this.storage.del(this.getStorageKey(socket)));
  }

  setResumeToken(socket, token) {
    return Promise.resolve(this.storage.set(this.getStorageKey(socket), token));
  }

  getResumeToken(socket) {
    return Promise.resolve(this.storage.get(this.getStorageKey(socket)));
  }

  getFlushTimeout() {
    return this.constructor.getFlushTimeout();
  }

  getQueryCleanupTimeout() {
    return this.constructor.getQueryCleanupTimeout();
  }

  getSubscriptionCleanupTimeout() {
    return this.constructor.getSubscriptionCleanupTimeout();
  }

  nextUniqueId() {
    this.counter += 1;
    return this.counter.toString();
  }

  middleware() {
    const middlewares = [
      thunk,
      connection,
      messages,
      wrapWithPromise, // needs to go after messages, because id must be set
      currentUser,
      collections,
      methods,
      queries,
      subscriptions,
    ].map(module => module.createMiddleware(this));
    return (store) => {
      const chain = middlewares.map(middleware => middleware(store));
      return chain.reduce((a, b) => next => a(b(next)));
    };
  }

  extractEntities(result, options) {
    return this.constructor.defaultExtractEntities(result, options);
  }

  cleanError(error) {
    return this.constructor.toDDPError(error);
  }

  /**
   * Transforms different types of data into an instance of DDPError.
   * If falsy value is passed, null is return.
   * @param {string|object|DDPError} error
   * @returns {DDPError}
   */
  static toDDPError(error) {
    if (!error) {
      return null;
    }
    if (error instanceof DDPError) {
      return error;
    }
    if (error && typeof error === 'object') {
      return new DDPError(error.error, error.reason, error.details);
    }
    if (typeof error === 'string') {
      return new DDPError(error);
    }
    return new DDPError();
  }

  static reducer() {
    const reducers = mapValues({
      connection,
      messages,
      currentUser,
      collections,
      methods,
      queries,
      subscriptions,
    }, module => module.createReducer(this));
    return (state = {}, action) =>
      // TODO: Filter relevant actions; do nothing if action is unknown.
      carefullyMapValues(reducers, (reducer, key) => reducer(state[key], action));
  }

  static registerModel(Model, collection) {
    this.models[collection] = Model;
  }

  static getFlushTimeout() {
    return this.defaultFlushTimeout;
  }

  static getQueryCleanupTimeout() {
    return this.defaultQueryCleanupTimeout;
  }

  static getSubscriptionCleanupTimeout() {
    return this.defaultSubscriptionCleanupTimeout;
  }

  static defaultExtractEntities(result) {
    return result.entities;
  }

  static fetch(name, params, properties) {
    const {
      queryId,
      socketId,
    } = properties;
    return (dispatch) => {
      dispatch(queryUpdate(queryId, null));
      dispatch(callMethod(name, params, {
        queryId,
        socketId,
      })).then((result) => {
        dispatch(queryUpdate(queryId, { result }));
      }).catch((error) => {
        dispatch(queryUpdate(queryId, { error }));
      });
    };
  }
}

DDPClient.defaultFlushTimeout = 100;
DDPClient.defaultQueryCleanupTimeout = 30000;
DDPClient.defaultSubscriptionCleanupTimeout = 30000;

export default DDPClient;

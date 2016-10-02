import WKPostMessenger from '../src/WKPostMessenger';

const mockPostMessageTarget = (
  handshakeTimeout = 0,
  messageTimeout = handshakeTimeout,
  wkParentCallback = () => {}
) => ({
  postMessage(payload) {
    const { id, callback, action, data } = payload;
    switch (action) {
      case '__WK_HANDSHAKE__':
        if (handshakeTimeout) {
          setTimeout(() => { window[callback](id, data); }, handshakeTimeout);
        } else {
          window[callback](id, data);
        }
        break;
      case '__WK_CALLBACK__':
        wkParentCallback(payload);
        break;
      default:
        if (messageTimeout) {
          setTimeout(() => { window[callback](id, { action, data }); }, messageTimeout);
        } else {
          window[callback](id, { action, data });
        }
        break;
    }
  },
});

const prepareEnv = (messageHandlers = { wkPostMessage: mockPostMessageTarget() }) => {
  window.webkit = { messageHandlers };
};
const destroyEnv = () => {
  delete window.webkit;
  delete window.wkPostMessengerHandleMessage;
  delete window.wkPostMessengerCallback;
};

describe('WKPostMessenger', () => {
  describe('#constructor', () => {
    describe('defaults', () => {
      let postMessenger;
      before(() => {
        prepareEnv();
        postMessenger = new WKPostMessenger();
      });
      after(() => {
        destroyEnv();
      });

      it('creates a WKPostMessenger instance', () => {
        assert.isTrue(postMessenger instanceof WKPostMessenger);
      });

      it('uses wkPostMessage as the script message handler', () => {
        assert.strictEqual(postMessenger.parent, window.webkit.messageHandlers.wkPostMessage);
      });

      it('creates wkPostMessengerHandleMessage global function', () => {
        assert.isFunction(window.wkPostMessengerHandleMessage);
      });

      it('creates wkPostMessengerCallback global function', () => {
        assert.isFunction(window.wkPostMessengerCallback);
      });
    });

    describe('options', () => {
      it('uses the specified handleMessage as a callback when receiving messages', () => {
        prepareEnv();
        const handleMessage = () => {};
        const postMessenger = new WKPostMessenger({ handleMessage });
        assert.strictEqual(postMessenger.handleMessage, handleMessage);
        destroyEnv();
      });

      it('uses scriptMessageHandler to find the script message handler', () => {
        prepareEnv({ customScriptHandler: mockPostMessageTarget() });
        const { messageHandlers } = window.webkit;
        const scriptMessageHandler = 'customScriptHandler';
        const postMessenger = new WKPostMessenger({ scriptMessageHandler });
        assert.strictEqual(postMessenger.parent, messageHandlers[scriptMessageHandler]);
        destroyEnv();
      });

      it('uses handlerGlobal to create a global message handler function', () => {
        prepareEnv();
        const handlerGlobal = 'customPostMessengerHandleMessage';
        new WKPostMessenger({ handlerGlobal });
        assert.isUndefined(window.wkPostMessengerHandleMessage, 'default handler is not added');
        assert.isFunction(window[handlerGlobal]);
        destroyEnv();
      });

      it('uses callbackGlobal to create a global callback handler function', () => {
        prepareEnv();
        const callbackGlobal = 'customPostMessengerCallback';
        new WKPostMessenger({ callbackGlobal });
        assert.isUndefined(window.wkPostMessengerCallback, 'default callback is not added');
        assert.isFunction(window[callbackGlobal]);
        destroyEnv();
      });

      it('uses handshakeTimeout to specify the timeout for the initial handshake', () => {
        prepareEnv();
        const handshakeTimeout = 1337;
        const postMessenger = new WKPostMessenger({ handshakeTimeout });
        assert.strictEqual(postMessenger._handshakeTimeout, handshakeTimeout);
        destroyEnv();
      });

      it('uses messageTimeout to specify the acknowledgement timeout when sending messages', () => {
        prepareEnv();
        const messageTimeout = 1337;
        const postMessenger = new WKPostMessenger({ messageTimeout });
        assert.strictEqual(postMessenger._messageTimeout, messageTimeout);
        destroyEnv();
      });

      it('uses the specified idGenerator when sending messages to generate a token', () => {
        prepareEnv();
        const idGenerator = { next: () => ({ value: '123' }) };
        const postMessenger = new WKPostMessenger({ idGenerator });
        assert.strictEqual(postMessenger._idGen, idGenerator);
        destroyEnv();
      });
    });

    it('throws an error if the parent handler cannot be found', () => {
      assert.throws(() => {
        new WKPostMessenger();
      }, "Can't add message handler wkPostMessage");
    });
  });

  describe('#sendHandshake', () => {
    it('does a postMessage to the parent to initiate the handshake', () => {
      prepareEnv();
      const sandbox = sinon.sandbox.create();
      const wkPostMessage = sandbox.spy(window.webkit.messageHandlers.wkPostMessage, 'postMessage');
      new WKPostMessenger();
      sinon.assert.calledOnce(wkPostMessage);
      sinon.assert.calledWithMatch(wkPostMessage, {
        type: 'application/x-wkpostmessenger-v1+json',
        callback: 'wkPostMessengerCallback',
        action: '__WK_HANDSHAKE__',
        data: 'wkPostMessengerHandleMessage',
      });
      sandbox.restore();
      destroyEnv();
    });

    it('returns a Promise that resolves when the handshake is acknowledged', () => {
      prepareEnv({ wkPostMessage: mockPostMessageTarget(1) });
      const postMessenger = new WKPostMessenger({ autoHandshake: false, handshakeTimeout: 100 });
      const promise = postMessenger.sendHandshake();
      assert.isTrue(promise instanceof Promise);
      return promise
        .then(destroyEnv)
        .catch(() => {
          destroyEnv();
          assert.fail('Handshake was not acknowledged');
        });
    });

    it('times out if the handshake is not acknowledged in time', () => {
      prepareEnv({ wkPostMessage: mockPostMessageTarget(10) });
      const postMessenger = new WKPostMessenger({ autoHandshake: false, handshakeTimeout: 1 });
      const promise = postMessenger.sendHandshake();
      assert.isTrue(promise instanceof Promise);
      return promise
        .then(() => Promise.reject('Handshake did not timeout'))
        .catch((e) => {
          destroyEnv();
          if (e !== '[WKPostMessenger] handshake acknowledgment timeout') {
            assert.fail(e);
          }
        });
    });

    it('throws an error if trying to send the handshake after already being connected', () => {
      prepareEnv();
      const postMessenger = new WKPostMessenger({ autoHandshake: false });
      return postMessenger.sendHandshake()
        .then(() => {
          assert.throws(() => {
            postMessenger.sendHandshake();
          }, '[WKPostMessenger] sendHandshake was already completed!!');
          destroyEnv();
        });
    });
  });

  describe('#sendMessage', () => {
    it('does a postMessage to the parent to send a message', () => {
      prepareEnv();
      const sandbox = sinon.sandbox.create();
      const wkPostMessage = sandbox.spy(window.webkit.messageHandlers.wkPostMessage, 'postMessage');
      const postMessenger = new WKPostMessenger();
      const action = 'testAction';
      const data = { foxtrotUniform: 'charlieKilo' };
      const promise = postMessenger.sendMessage(action, data);
      return promise
        .then(() => {
          sinon.assert.calledTwice(wkPostMessage);
          sinon.assert.calledWithMatch(wkPostMessage, {
            type: 'application/x-wkpostmessenger-v1+json',
            callback: 'wkPostMessengerCallback',
            action: '__WK_HANDSHAKE__',
            data: 'wkPostMessengerHandleMessage',
          });
          sinon.assert.calledWithMatch(wkPostMessage, {
            type: 'application/x-wkpostmessenger-v1+json',
            callback: 'wkPostMessengerCallback',
            action,
            data,
          });
          sandbox.restore();
          destroyEnv();
        })
        .catch((e) => {
          sandbox.restore();
          destroyEnv();
          assert.fail(e);
        });
    });

    it('waits for the handshake before sending the message', () => {
      prepareEnv({ wkPostMessage: mockPostMessageTarget() });
      const postMessenger = new WKPostMessenger({ autoHandshake: false, messageTimeout: 1 });

      const handshakeComplete = sinon.spy(() => {});
      postMessenger.sendHandshake().then(handshakeComplete);

      const messageComplete = sinon.spy(() => {});
      const action = 'testPatience';
      const data = { waitingFor: 'tonight' };
      const promise = postMessenger.sendMessage(action, data);
      promise.then(messageComplete);

      return promise
        .then(() => {
          sinon.assert.callOrder(handshakeComplete, messageComplete);
          destroyEnv();
        })
        .catch((e) => {
          destroyEnv();
          assert.fail(e);
        });
    });

    it('implicitly calls the handshake if necessary', () => {
      prepareEnv({ wkPostMessage: mockPostMessageTarget() });
      const sandbox = sinon.sandbox.create();
      const postMessenger = new WKPostMessenger({ autoHandshake: false, messageTimeout: 1 });
      const sendHandshake = sinon.spy(postMessenger, 'sendHandshake');
      const sendMessage = sinon.spy(postMessenger, '_sendMessage');
      const action = 'testHandshakeMessage';
      const data = { preflight: 'check!' };
      postMessenger.sendMessage(action, data);
      sinon.assert.callOrder(sendHandshake, sendMessage);
      sandbox.restore();
      destroyEnv();
    });

    it('returns a Promise that resolves with data from the parent', (done) => {
      prepareEnv({ wkPostMessage: mockPostMessageTarget() });
      const destroyEnvAndDone = () => {
        destroyEnv();
        done();
      };
      const postMessenger = new WKPostMessenger({ handshakeTimeout: 1, messageTimeout: 1 });
      const action = 'testPromiseResolve';
      const data = { tyrion: 'lannister' };
      const promise = postMessenger.sendMessage(action, data);
      assert.isTrue(promise instanceof Promise);
      promise
        .then(() => {
          destroyEnvAndDone();
        })
        .catch(() => {
          destroyEnvAndDone();
          assert.fail('Promise was not resolved');
        });
    });

    it('times out if the message is not acknowledged in time', () => {
      prepareEnv({ wkPostMessage: mockPostMessageTarget(0, 10) });
      const postMessenger = new WKPostMessenger({ handshakeTimeout: 1, messageTimeout: 1 });
      const action = 'testPromiseTimeout';
      const data = { later: 'dude' };
      const promise = postMessenger.sendMessage(action, data);
      return promise
        .then(() => Promise.reject('Message did not timeout'))
        .catch((e) => {
          destroyEnv();
          if (e !== '[WKPostMessenger] message acknowledgment timeout') {
            assert.fail(e);
          }
        });
    });

    it('accepts a custom timeout', () => {
      prepareEnv({ wkPostMessage: mockPostMessageTarget(0, 10) });
      const postMessenger = new WKPostMessenger();
      const action = 'testCustomTimeout';
      const data = { daylight: 'savingsTime' };
      const promise = postMessenger.sendMessage(action, data, 1);
      return promise
        .then(() => Promise.reject('Message did not timeout'))
        .catch((e) => {
          destroyEnv();
          if (e !== '[WKPostMessenger] message acknowledgment timeout') {
            assert.fail(e);
          }
        });
    });

    it('generates different IDs', () => {
      const sandbox = sinon.sandbox.create();
      prepareEnv({ wkPostMessage: mockPostMessageTarget() });
      const postMessenger = new WKPostMessenger({
        idGenerator: (() => {
          let inc = 0;
          /* eslint-disable no-plusplus */
          return { next: () => ({ value: `${inc++}` }) };
          /* eslint-enable no-plusplus */
        })(),
      });
      const wkPostMessage = sandbox.spy(window.webkit.messageHandlers.wkPostMessage, 'postMessage');
      const action = 'testIds';
      const data = { count: 'chocula' };
      return Promise.all([
        postMessenger.sendMessage(action, data),
        postMessenger.sendMessage(action, data),
      ]).then(() => {
        sinon.assert.calledTwice(wkPostMessage);
        sinon.assert.calledWithMatch(wkPostMessage, { id: '1', action, data });
        sinon.assert.calledWithMatch(wkPostMessage, { id: '2', action, data });
        sandbox.restore();
        destroyEnv();
      });
    });
  });

  describe('#handleMessage', () => {
    it('is invoked when receiving messages from the parent', () => {
      prepareEnv({ wkPostMessage: mockPostMessageTarget() });
      const handleMessage = sinon.spy(() => {});
      new WKPostMessenger({ handleMessage });
      const id = 'some-ios-uuid';
      const action = 'testHandle';
      const data = ['dogs', 'are', 'cool'];
      window.wkPostMessengerHandleMessage(id, action, data);
      sinon.assert.calledOnce(handleMessage);
      sinon.assert.calledWithMatch(handleMessage, action, data);
    });

    it('invokes a callback on the parent with the ID and data', () => {
      const wkParentCallback = sinon.spy(() => {});
      prepareEnv({ wkPostMessage: mockPostMessageTarget(0, 0, wkParentCallback) });
      const handleMessage = (action, data) => ({
        action,
        data: data.reverse(),
      });
      new WKPostMessenger({ handleMessage });
      const id = 'some-ios-uuid';
      const action = 'testHandleCallback';
      const data = ['cats', 'are', 'ok'];
      window.wkPostMessengerHandleMessage(id, action, data);
      sinon.assert.calledOnce(wkParentCallback);
      sinon.assert.calledWithMatch(wkParentCallback, {
        type: 'application/x-wkpostmessenger-v1+json',
        action: '__WK_CALLBACK__',
        id,
        data: {
          action,
          data: ['ok', 'are', 'cats'],
        },
      });
    });

    it('can return Promises', () =>
     new Promise((resolve, reject) => {
       const timeout = setTimeout(reject, 20);
       const wkParentCallback = sinon.spy((payload) => {
         if (payload.action === '__WK_CALLBACK__') {
           clearTimeout(timeout);
           resolve(wkParentCallback);
         }
       });
       prepareEnv({ wkPostMessage: mockPostMessageTarget(0, 0, wkParentCallback) });
       const handleMessage = (action, data) => new Promise((resolveMessage) => {
         setTimeout(() => resolveMessage({ action, data }), 10);
       });
       new WKPostMessenger({ handleMessage });
       const id = 'some-ios-uuid';
       const action = 'testHandleCallbackPromise';
       const data = ['wawa', 'hoagie', 'fest'];
       window.wkPostMessengerHandleMessage(id, action, data);
     })
        .then((wkParentCallback) => {
          sinon.assert.calledOnce(wkParentCallback);
          sinon.assert.calledWithMatch(wkParentCallback, {
            type: 'application/x-wkpostmessenger-v1+json',
            action: '__WK_CALLBACK__',
            id: 'some-ios-uuid',
            data: {
              action: 'testHandleCallbackPromise',
              data: ['wawa', 'hoagie', 'fest'],
            },
          });
        })
    );

    it('still invokes callback without handleMessage', () => {
      const wkParentCallback = sinon.spy(() => {});
      prepareEnv({ wkPostMessage: mockPostMessageTarget(0, 0, wkParentCallback) });
      new WKPostMessenger();
      const id = 'some-ios-uuid';
      const action = 'testNoHandlerCallback';
      window.wkPostMessengerHandleMessage(id, action, {});
      sinon.assert.calledOnce(wkParentCallback);
      sinon.assert.calledWithMatch(wkParentCallback, {
        type: 'application/x-wkpostmessenger-v1+json',
        action: '__WK_CALLBACK__',
        id,
      });
    });
  });
});

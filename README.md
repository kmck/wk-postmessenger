WKPostMessenger
===============

`WKPostMessenger` creates a synced channel via postMessage to facilitate communication between a Swift and JavaScript.

It's kind of like [Postmate](https://github.com/dollarshaveclub/postmate), except between webview and the iOS application where it live, not between two windows.

Messages passed back and forth contain an action (analogous to a function call) and data (an optional object with a bunch of data.). These messages also send an ID that is used as a token to keep track of multiple messages and their responses.

## Why

Swift provides `evaluateJavaScript` and `addScriptMessageHandler` for communication to and from JS in a webview, but these commands do not inherently verify that messages are received by the other side.

This library defines a common format for messages sent back and forth and allows for asynchronous return values (ie. Promises).

## Installation and Usage

### iOS

There isn't a corresponding Swift library for this (...yet?), but here's a rough outline of how to get it working.

#### Setup

* Add a script message handler.

  ```swift
  class WKPostMessageScriptMessageHandler: NSObject, WKScriptMessageHandler {
    func userContentController(userContentController: WKUserContentController, didReceiveScriptMessage message: WKScriptMessage!) {
      if message.name == "wkPostMessage" {
        let payload = // decoded message.body

        switch action {
        case .__WK_HANDSHAKE__:
          // Handshake data contains global JS function for sending messages
          self.wkPostMessage = // payload.data to a string
          // Acknowledge the handshake
          let messageID = "\"\(payload.id)\"" // needs to be unique and escaped for JS
          webview?.evaluateJavaScript("\(payload.callback)(\(messageID))", completionHandler: nil)
        case .__WK_CALLBACK__:
          // payload.id contains the ID of the message originally sent from Swift
          // payload.data contains anything returned by the callback, which can be of any type
        case .yourAction:
          // payload.data contains anything returned by the callback, which can be of any type
          let messageID = "\"\(payload.id)\"" // needs to be unique and escaped for JS
          let jsonStringResult = // whatever you want, encoded for JS
          let callbackJs = "\(payload.callback)(\(messageID), \(jsonStringResult));"
          webview?.evaluateJavaScript(callbackJs, completionHandler: nil)
        }
      }
    }
  }

  let contentController = WKUserContentController()
  let handler = WKPostMessageScriptMessageHandler()
  contentController.addScriptMessageHandler(handler, name: "wkPostMessage")
  ```

#### Sending messages

```swift
if let wkPostMessage = self.wkPostMessage {
  // needs to be unique and escaped for JS
  let messageID = "\"\(NSUUID().UUIDString)\""
  let messageAction = "\"resetForm\""
  let messageDataJsonString = // whatever you want, encoded for JS

  let messageJs = "\(wkPostMessage)(\(messageID), \(messageAction), \(messageDataJsonString));"
  webview?.evaluateJavaScript(messageJs, completionHandler: nil)

  // the __WK_CALLBACK__ you receive with messageID returned as the message ID
  // is the response from JavaScript!
}
```

#### Receiving messages

* Define actions as cases in the script message handler.
* Do whatever decoding is necessary on `payload.data`. This is the trickiest part, because JS is loosey-goosey with types. Ideally, you want to be able to handle anything gracefully on the decoding side, even if you're expecting data in a specific format.

### JavaScript

#### Setup

* Install this library.

  ```bash
  npm install --save wk-postmessenger
  ```

  Depending on your use case, grabbing the [minified build](browser/WKPostMessenger.min.js) might be more convenient. Follow your heart.

* Build the page that you want to use in your webview and create a `WKPostMessenger` instance that defines message handling behavior.

  ```js
  import WKPostMessenger from 'wk-postmessenger';
  const postMessenger = new WKPostMessenger({
    handleMessage(action, data) {
      // Your code to handle messages from the iOS app
    },
  });
  ```

* A handshake postMessage sent from the webview to the application establishes the channel. This message uses a special `__WK_HANDSHAKE__` action and data containing a string indicating the global function in the webview that accept messages from the iOS side.

#### Sending messages

* Call `sendMessage` with an action name and optional data.

  ```js
  postMessenger.sendMessage('doSomethingInApp', {
    quickly: 'Sure, I guess.',
  })
    .then((results) => {
      // Resolves when the app sends a response acknowledging that the message
      // was received and processed. Note that it doesn't necessarily have to
      // return any data, but it can!
      console.log('It did something!', results);
    })
    .catch(() => {
      // If iOS doesn't acknowledge the message within the timeout, the Promise
      // automatically rejects.
    });
  ```

* `sendMessage` also takes a third parameter for a custom timeout, which might come in handy if the application has to do an asynchronous operation that takes longer than the default timeout.

#### Receiving messages

* The `handleMessage` option allows you to define the behavior for messages from the iOS app. The return value is sent back to iOS.

  ```js
  const postMessenger = new WKPostMessenger({
    handleMessage(action, data) {
      switch (action) {
        case 'getDogProperties':
          if (data.name === 'Clifford') {
            return { color: 'red', size: 'big' };
          }
          return { color: 'furry', size: 'dog-sized' };
        default:
          // Unrecognized message?
          break;
      }
    },
  });
  ```

* The return value can also be a `Promise`, in which case the response will be sent to iOS when it resolves.

  ```js
  const postMessenger = new WKPostMessenger({
    handleMessage(action, data) {
      switch (action) {
        case 'doAsyncThing':
          return new Promise((resolve) => {
            setTimeout(() => resolve('at long last!'), 9000);
          });
        default:
          break;
      }
    },
  });
  ```

## License

[MIT](https://opensource.org/licenses/MIT)

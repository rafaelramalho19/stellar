import fs from 'fs';
import util from 'util';
import path from 'path';
import Primus from 'primus';
import UglifyJS from 'uglify-js';
import GenericServer from '../genericServer';
import browser_fingerprint from 'browser_fingerprint';

// server type
let type = 'websocket';

// server attributes
let attributes = {
  canChar: true,
  logConnections: true,
  logExists: true,
  sendWelcomeMessage: true,
  verbs: [
    'quit',
    'exit',
    'documentation',
    'roomAdd',
    'roomLeave',
    'roomView',
    'detailsView',
    'say'
  ]
};

export default class WebSocketServer extends GenericServer {

  /**
   * Server instance.
   */
  server;

  /**
   * Creates a new server instance.
   *
   * @param api stellar engine interface.
   * @param options sever options.
   */
  constructor(api, options) {
    super(api, type, options, attributes);

    let self = this;

    // connection event
    self.on('connection', (connection) => {
      connection.rawConnection.on('data', (data) => {
        self._handleData(connection, data);
      })
    });

    // action complete event
    self.on('actionComplete', (data) => {
      if (data.toRender !== false) {
        data.connection.response.messageCount = data.messageCount;
        self.sendMessage(data.connection, data.response, data.messageCount);
      }
    });
  }

  // ------------------------------------------------------------------------------------------------ [REQUIRED METHODS]

  /**
   * Start the server
   *
   * @param next
   */
  start(next) {
    let self = this;
    let webserver = self.api.servers.servers.web;

    // create a new primus instance
    self.server = new Primus(webserver.server, self.api.config.servers.websocket.server);

    // define some event handlers
    self.server.on('connection', function (rawConnection) {
      self._handleConnection(rawConnection);
    });

    self.server.on('disconnection', function (rawConnection) {
      self._handleDisconnection(rawConnection);
    });

    self.api.log(`webSocket bound to ${webserver.options.bindIP}:${webserver.options.port}`, 'debug');
    self.server.active = true;

    // write client js
    self._writeClientJS();

    // execute the callback
    next();
  }

  /**
   * Shutdown the websocket server.
   *
   * @param next Callback
   */
  stop(next) {
    let self = this;

    // disable the server
    self.active = false;

    // destroy clients connections
    if (self.api.config.servers.websocket.destroyClientOnShutdown === true) {
      self.connections().forEach((connection) => {
        connection.destroy();
      });
    }

    // execute the callback on the next tick
    process.nextTick(() => {
      next();
    });
  }

  sendMessage(connection, message, messageCount) {
    let self = this;

    // serialize the error if exists
    if (message.error) {
      message.error = self.api.config.errors.serializers.servers.websocket(message.error);
    }

    if (!message.context) {
      message.context = 'response';
    }

    if (!messageCount) {
      messageCount = connection.messageCount;
    }

    if (message.context === 'response' && !message.messageCount) {
      message.messageCount = messageCount;
    }

    connection.rawConnection.write(message);
  }

  sendFile() {
    // todo
    console.log("todo:sendFile");
  }

  goodbye(connection) {
    connection.rawConnection.end();
  }

  //////////////////// [PRIVATE METHODS]

  _compileClientJS() {
    let self = this;

    let clientSource = fs.readFileSync(__dirname + '/../client.js').toString();
    let url = self.api.config.servers.websocket.clientUrl;

    // replace any url by client url
    clientSource = clientSource.replace(/\'%%URL%%\'/g, url);

    let defaults = {};
    for (var i in self.api.config.servers.websocket.client) {
      defaults[ i ] = self.api.config.servers.websocket.client[ i ];
    }
    defaults.url = url;

    let defaultsString = util.inspect(defaults);
    defaultsString = defaultsString.replace('\'window.location.origin\'', 'window.location.origin');
    clientSource = clientSource.replace('\'%%DEFAULTS%%\'', defaultsString);

    return clientSource;
  }

  _renderClientJs(minimize = false) {
    let self = this;

    let libSource = self.api.servers.servers.websocket.server.library();
    let clientSource = self._compileClientJS();

    clientSource =
      ';;;\r\n' +
      '(function(exports){ \r\n' +
      clientSource +
      '\r\n' +
      'exports.StellarClient = StellarClient; \r\n' +
      '})(typeof exports === \'undefined\' ? window : exports);';

    if (minimize) {
      return UglifyJS.minify(`${libSource}\r\n\r\n\r\n${clientSource}`, {fromString: true}).code;
    } else {
      return `${libSource}\r\n\r\n\r\n${clientSource}`;
    }
  }

  /**
   * Write client js code.
   */
  _writeClientJS() {
    let self = this;

    if (self.api.config.servers.websocket.clientJsName) {
      let base = path.normalize(
        self.api.config.general.paths.temp + path.sep +
        self.api.config.servers.websocket.clientJsName);

      try {
        fs.writeFileSync(`${base}.js`, self._renderClientJs(false));
        self.api.log(`write ${base}.js`, 'debug');
        fs.writeFileSync(`${base}.min.js`, self._renderClientJs(true));
        self.api.log(`wrote ${base}.min.js`, 'debug');
      } catch (e) {
        self.api.log(`Cannot write client-side JS for websocket server:`, 'warning');
        self.api.log(e, 'warning');
        throw e;
      }
    }
  }

  _handleConnection(rawConnection) {
    let self = this;

    let parsedCookies = browser_fingerprint.parseCookies(rawConnection);
    let fingerPrint = parsedCookies[ self.api.config.servers.web.fingerprintOptions.cookieKey ];

    self.buildConnection({
      rawConnection: rawConnection,
      remoteAddress: rawConnection.address.ip,
      remotePort: rawConnection.address.port,
      fingerprint: fingerPrint
    });
  }

  /**
   * Handle the disconnection event.
   *
   * @param rawConnection
   * @private
   */
  _handleDisconnection(rawConnection) {
    let self = this;

    for (let i in self.connections()) {
      if (self.connections()[i] && rawConnection.id == self.connections()[i].rawConnection.id) {
        self.connections()[i].destroy();
        break;
      }
    }
  }

  _handleData(connection, data) {
    let self = this;
    let verb = data.event;
    delete data.event;

    connection.messageCount++;
    connection.params = {};

    switch (verb) {
      case 'action':
        for (let v in data.params) {
          connection.params[v] = data.params[v];
        }

        connection.error = null;
        connection.response = {};
        self.processAction(connection);
        break;

      case 'file':
        connection.params = {
          file: data.file
        };

        self.processFile(connection);
        break;

      default:
        let words = [];
        let message;

        if (data.room) {
          words.push(data.room);
          delete data.room;
        }

        for (let i in data) {
          words.push(data[i]);
        }

        connection.verbs(verb, words, (error, data) => {
          if (!error) {
            message = {status: 'OK', context: 'response', data: data};
            self.sendMessage(connection, message);
          } else {
            message = {status: error, context: 'response', data: data};
            self.sendMessage(connection, message);
          }
        });
    }
  }

}
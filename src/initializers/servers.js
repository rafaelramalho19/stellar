// module dependencies
import _ from 'lodash';
import path from 'path';
import Utils from '../utils';

/**
 * Manager for server instances.
 */
class Servers {

  /**
   * Engine API instance.
   * @type {null}
   */
  api = null;

  /**
   * Array with all running server instances.
   *
   * @type {{}}
   */
  servers = {};

  /**
   * Class constructor.
   *
   * @param api engine api instance.
   */
  constructor(api) {
    this.api = api;
  }

  loadServers(next) {
    let self = this;

    // get list with the server files
    let serversFiles = Utils.getFiles(path.resolve(__dirname + '/../servers'));

    let started = 0;

    // iterate all server files
    _.forEach(serversFiles, function (file) {
      let parts = file.split(/[\/\\]+/);
      let server = _.last(parts).split('.')[ 0 ];

      // only load `.js` files (in debug we also have `.map`files)
      if (_.last(_.last(parts).split('.')) !== 'js') {
        return;
      }

      // check if the server is enabled on app config
      if (self.api.config.servers[ server ] && self.api.config.servers[ server ].enable == true) {
        // save the server instance
        self.servers[ server ] = new (require(file).default)(self.api, self.api.config.servers[ server ]);
        self.api.log(`initialized server: ${server}`, 'debug');
        started++;

        process.nextTick(function () {
          started--;
          if (started === 0) {
            next();
          }
        });
      }
    });

    if (started == 0) {
      next();
    }
  }

  startServers(next) {
    let started = 0;

    // check if exists any server loaded
    if (_.size(this.servers) === 0) {
      next();
    }

    for (let server in this.servers) {
      started++;

      this.api.log(`starting server: ${server}`, 'notice');
      this.servers[ server ].start(function (error) {
        if (error) {
          return next(error);
        }

        process.nextTick(function () {
          started--;
          if (started === 0) {
            next();
          }
        });
      });
    }
  }
}

export default class {

  /**
   * This should be loaded after all engine
   * loading initializers.
   *
   * @type {number}
   */
  static loadPriority = 30;

  static load(api, next) {
    // instance the server manager
    api.servers = new Servers(api);

    // load enabled servers
    api.servers.loadServers(next);
  }

  static start(api, next) {
    // start the serves
    api.servers.startServers(next);
  }

}

'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});

var _fs = require('fs');

var _fs2 = _interopRequireDefault(_fs);

var _path = require('path');

var _path2 = _interopRequireDefault(_path);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

class ConfigManager {

  /**
   * Create a new instance of the ConfigManager.
   *
   * @param api API reference object.
   */

  /**
   * Api reference object.
   *
   * @type {null}
   */
  constructor(api) {
    this.api = null;
    this._watchedFiles = [];
    this.api = api;
  }

  /**
   * Start the config execution.
   */


  /**
   * Files to watch for changes.
   *
   * @type {Array}
   * @private
   */
  execute(next) {
    // init the execution environment
    this._setupEnvironment

    // creates 'temp' folder if it does not exist
    ();this._createTempFolder

    // load manifest file, and core, project and modules configs
    ();this._loadConfigs

    // finish the config execution on the next tick
    ();process.nextTick(next);
  }

  /**
   * Setup the execution  environment.
   *
   * This define what environment should be used.
   *
   * TODO: use the command line arguments to define the environment
   */
  _setupEnvironment() {
    // if (argv.NODE_ENV) {
    //   this.api.env = argv.NODE_ENV
    // } else
    if (process.env.NODE_ENV) {
      this.api.env = process.env.NODE_ENV;
    } else {
      this.api.env = 'development';
    }
  }

  /**
   * Unwatch all files.
   */
  unwatchAllFiles() {
    // iterate all watched files and say to the FS to stop watch the changes
    this._watchedFiles.forEach(file => {
      _fs2.default.unwatchFile(file);
    }

    // reset the watch array
    );this._watchedFiles = [];
  }

  /**
   * Start watching for changes on a file and set a function to be executed
   * on the file change.
   *
   * @param file      File path
   * @param callback  Callback function.
   */
  watchFileAndAct(file, callback) {
    // normalise file path
    file = _path2.default.normalize(file

    // check if file exists
    );if (!_fs2.default.existsSync(file)) {
      throw new Error(`${file} does not exist, and cannot be watched`);
    }

    // the watch for files change only works on development mode
    if (this.api.config.general.developmentMode !== true || this._watchedFiles.indexOf(file) > 0) {
      return;
    }

    // push the new file to the array of watched files
    this._watchedFiles.push(file

    // say to the FS to start watching for changes in this file with an interval of 1 seconds
    );_fs2.default.watchFile(file, { interval: 1000 }, (curr, prev) => {
      if (curr.mtime > prev.mtime && this.api.config.general.developmentMode === true) {
        process.nextTick(() => {
          let cleanPath = file;

          // we need to replace the '/' by '\'
          if (process.platform === 'win32') {
            cleanPath = file.replace(/\//g, '\\');
          }

          // remove file from require cache to force reload the file
          delete require.cache[require.resolve(cleanPath)];

          // execute the callback function
          callback(file);
        });
      }
    });
  }

  /**
   * Reboot handler.
   *
   * This is executed when a config file is changed.
   *
   * @param file  File path who as changed.
   * @private
   */
  _rebootCallback(file) {
    this.api.log(`\r\n\r\n*** rebooting due to config change (${file}) ***\r\n\r\n`, 'info');
    delete require.cache[require.resolve(file)];
    this.api.commands.restart.call(this.api._self);
  }

  _loadConfigs() {
    // set config object on API
    this.api.config = {};

    // we don't start watching for file changes on state0
    const isToWatch = this.api.status === 'init_stage0';

    try {
      // read project manifest
      this.api.config = require(`${this.api.scope.rootPath}/manifest.json`);
    } catch (e) {
      // when the project manifest doesn't exists the user is informed
      // and the engine instance is terminated
      this.api.log('Project `manifest.json` file does not exists.', 'emergency'

      // finish process (we can not stop the Engine because it can not be run)
      );process.exit(1);
    }

    // load the default config files from the Stellar core
    this.loadConfigDirectory(`${__dirname}/../config`, false

    // load all the configs from the modules
    );this.api.config.modules.forEach(moduleName => this.loadConfigDirectory(`${this.api.scope.rootPath}/modules/${moduleName}/config`, isToWatch)

    // load the config files from the current universe if exists the platform
    // should be reloaded when the project configs changes
    );this.loadConfigDirectory(`${this.api.scope.rootPath}/config`, isToWatch);
  }

  /**
   * Load a directory as a config repository.
   *
   * @param configPath
   * @param watch
   */
  loadConfigDirectory(configPath, watch = false) {
    // get all files from the config folder
    let configFiles = this.api.utils.recursiveDirectoryGlob(configPath);

    let loadRetries = 0;
    let loadErrors = {};

    for (let i = 0, limit = configFiles.length; i < limit; i++) {
      // get the next file to be loaded
      let file = configFiles[i];

      try {
        // attempt configuration file load
        let localConfig = require(file);
        if (localConfig.default) {
          this.api.config = this.api.utils.hashMerge(this.api.config, localConfig.default, this.api);
        }
        if (localConfig[this.api.env]) {
          this.api.config = this.api.utils.hashMerge(this.api.config, localConfig[this.api.env], this.api);
        }

        // configuration file load success: clear retries and errors since progress
        // has been made
        loadRetries = 0;
        loadErrors = {};

        // configuration file loaded: set watch
        if (watch !== false) {
          this.watchFileAndAct(file, this._rebootCallback.bind(this));
        }
      } catch (error) {
        // error loading configuration, abort if all remaining configuration files
        // have been tried and failed indicating inability to progress
        loadErrors[file] = error.toString();
        if (++loadRetries === limit - i) {
          throw new Error('Unable to load configurations, errors: ' + JSON.stringify(loadErrors));
        }
        // adjust configuration files list: remove and push failed configuration to
        // the end of the list and continue with next file at same index
        configFiles.push(configFiles.splice(i--, 1)[0]);
      }
    }
  }

  /**
   * Creates the 'temp' folder if it does not exist.
   *
   * This folder is used to store the log files.
   *
   * @private
   */
  _createTempFolder() {
    if (!this.api.utils.directoryExists(`${this.api.scope.rootPath}/temp`)) {
      this.api.utils.createFolder(`${this.api.scope.rootPath}/temp`);
    }
  }
}

/**
 * This initializer loads all app configs to the current running instance.
 */
exports.default = class {
  constructor() {
    this.loadPriority = 0;
  }
  /**
   * Load priority.
   *
   * This initializer needs to be loaded first of all
   * others.
   *
   * @type {number}
   */


  /**
   * Load satellite function.
   *
   * @param api   API object reference.
   * @param next  Callback function.
   */
  load(api, next) {
    // put the config instance available on the API object
    api.configs = new ConfigManager(api);

    // start the config manager execution
    api.configs.execute(next);
  }

  /**
   * Start satellite function.
   *
   * @param api   Api object reference.
   * @param next  Callback function.
   */
  start(api, next) {
    // print out the current environment
    api.log(`environment: ${api.env}`, 'notice'

    // finish the satellite start
    );next();
  }

  stop(api, next) {
    // stop watching all files
    api.configs.unwatchAllFiles

    // finish the satellite stop
    ();next();
  }
};
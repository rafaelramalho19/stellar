'use strict'

// ----------------------------------------------------------------------------- [Imports]

const Command = require('../Command')
const REPL = require('repl')

// ----------------------------------------------------------------------------- [Command]

class ConsoleCommand extends Command {

  constructor () {
    // request the engine initialization
    super(true)

    // define the command
    this.command = 'console'
    this.describe = 'Create a REPL connection with a Stellar instance'
  }

  run () {
    // disable all the servers
    for (const index in this.api.config.servers) {
      this.api.config.servers[index].enabled = false
    }

    // disable development mode
    this.api.config.general.developmentMode = false

    // disable the task manager system
    this.api.config.tasks.scheduler = false
    this.api.config.tasks.queues = []
    this.api.config.tasks.minTaskProcessors = 0
    this.api.config.tasks.maxTaskProcessors = 0

    // start the engine
    this.engine.start((error, api) => {
      // if an error occurs throw it
      if (error) { throw error }

      // give some time the server goes up
      setTimeout(_ => {
        // create a REPL instance
        const repl = REPL.start({
          prompt: `${api.env}>`,
          input: process.stdin,
          output: process.stdout,
          useGlobal: false
        })

        // put the api into context
        repl.context.api = api
      }, 500)
    })
  }

}

// export command
module.exports = new ConsoleCommand()

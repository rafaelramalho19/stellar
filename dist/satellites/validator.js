'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});

var _validatorMessages = require('../../staticFiles/validatorMessages.json');

var _validatorMessages2 = _interopRequireDefault(_validatorMessages);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

/**
 * This class is used to describe an invalid argument exceptions.
 */
class InvalidArgumentException {
  constructor(message) {
    this.message = message;
    this.name = 'InvalidArgumentException';
  }
}

/**
 * This class allow developers testes values against a set of validators.
 *
 * This is used by the ActionProcessor to validator the action input params.
 *
 * You can use this manually like this:
 *
 * <code>
 *   api.validator.validate(validatorString, params, keyToValidate)
 * </code>
 */
class Validator {

  /**
   * Create a new Validator instance.
   *
   * @param api API reference object.
   */


  /**
   * Array with the implicit validators.
   *
   * @type {string[]}
   */


  /**
   * Request parameters.
   *
   * @type {{}}
   */
  constructor(api) {
    this.api = null;
    this.params = {};
    this.rules = {};
    this._sizeRules = ['size', 'between', 'min', 'max'];
    this.api = api;
  }

  /**
   * Run the validator's rules against its data.
   *
   * @param Object data   Hash with the data to be validated.
   * @param Object rules  Hash with the rules who the data will be validated
   *                      against with.
   */


  /**
   * The size related validation rules.
   *
   * @type {Array}
   */


  /**
   * Request rules.
   *
   * @type {Object}
   */


  /**
   * API reference object.
   *
   * @type {null}
   */
  validate(data, rules) {
    // hash with all founded errors
    const errors = new Map();

    // save the parameters on the validator instance. Some validators needs to
    // access other parameters.
    this.params = data;

    // parse all given rules and save them to use later
    this.rules = this._parseRules(rules);

    // iterate through the fields under validation
    for (const fieldName in this.rules) {
      // get the data value for the current fields
      const value = data[fieldName];

      // iterate the rules applied to the current field
      for (const ruleName in this.rules[fieldName]) {
        // get the rules parameters
        const ruleParameters = this.rules[fieldName][ruleName];

        // if the property has undefined only implicit validators can be applied
        if (value === undefined && Validator.implicitValidators.indexOf(ruleName) === -1) {
          break;
        }

        // the validation can be a function. We must do all the validation here
        // and we must `continue` at the end
        if (ruleName === 'function') {
          let funcResponse = null;

          // execute the function. The API context and the param value must be
          // passed. If the response is a string that means the validations
          // fails, that string will be used as a error message.
          funcResponse = rules[fieldName].call(this.api, data[fieldName]);

          if (typeof funcResponse === 'string') {
            errors.set(fieldName, funcResponse);
          } else if (funcResponse === false) {
            errors.set(fieldName, `The ${ fieldName } field do not match with the validator function.`);
          }

          continue;
        }

        // before continue we check if the validator exists
        if (!this._isAValidator(ruleName)) {
          throw new Error(`The is no validator named '${ ruleName }'`);
        }

        // execute the correspondent validator and if the response if `false` a
        // failure message will be added to the errors hash. The exec methods
        // also can return
        if (!this[`validator_${ ruleName }`](value, ruleParameters, fieldName)) {
          this._addFailure(fieldName, ruleName, ruleParameters, errors);
          continue;
        }
      }
    }

    // it was found no errors is returned true, otherwise a hash with all the
    // errors is returned
    return errors.size === 0 ? true : errors;
  }

  /**
   * Parse the rules and return a structured hash with all information.
   */
  _parseRules(rules) {
    const result = {};

    // iterate all fields
    for (const fieldName in rules) {
      const field = {};

      // some fields can be a RegExp instance, so we need convert them into a
      // regular validator
      if (rules[fieldName] instanceof RegExp) {
        const reg = rules[fieldName];
        field['regex'] = [reg.source, reg.flags];
      } else if (typeof rules[fieldName] === 'function') {
        field['function'] = [];
      } else {
        // iterate all validators of the current field
        rules[fieldName].split('|').forEach(validatorS => {
          const parts = validatorS.split(':');
          const parameters = parts[1] ? parts[1].split(',') : [];

          field[parts[0]] = parameters;
        });
      }

      // add the field to the result hash
      result[fieldName] = field;
    }

    return result;
  }

  /**
   * Add an error message to the errors hash.
   *
   * @todo add support for translation.
   */
  _addFailure(attribute, rule, parameters, errors) {
    // get the error message
    let message = this._getMessage(attribute, rule);

    // if there is no message for the validator throw an error
    if (message === undefined) {
      throw new Error(`No error message was been specified for the '${ rule }' validator`);
    }

    // replace the fields on the error message
    message = this._doReplacements(message, attribute, rule, parameters);

    // set the error message on the errors hash
    errors.set(attribute, message);
  }

  /**
   * This check if one attribute has a specific rule.
   */
  _attributeHasRule(attribute, rule) {
    if (!this.rules[attribute]) {
      return false;
    }

    return this.rules[attribute][rule] !== undefined;
  }

  _getMessage(attribute, rule) {
    // check if is a size rule
    if (this._sizeRules.indexOf(rule) > -1) {
      let type = null;

      if (this._attributeHasRule(attribute, 'numeric')) {
        type = 'numeric';
      } else if (this._attributeHasRule(attribute, 'array')) {
        type = 'array';
      } else {
        type = 'string';
      }

      return _validatorMessages2.default[rule][type];
    }

    return _validatorMessages2.default[rule];
  }

  /**
   * Replace all error message place-holders with actual values.
   *
   * @param String message
   * @param String attribute
   * @param String rule
   * @param Array parameters
   */
  _doReplacements(message, attribute, rule, parameters) {
    // replace attribute placeholder
    message = message.replace(/:attribute/gi, attribute);

    // check if there is a specific replacer for this type of rule
    const replacerMethod = `replace_${ rule }`;
    if (this[replacerMethod] !== undefined) {
      message = this[replacerMethod](message, attribute, rule, parameters);
    }

    return message;
  }

  /**
   * Require a certain number of parameters to be present.
   *
   * @param Number int
   * @param Array parameters
   * @param String rule
   *
   * @throws InvalidArgumentException
   */
  _requireParameterCount(count, parameters, rule) {
    if (!parameters || parameters.length < count) {
      throw new InvalidArgumentException(`Validation rule ${ rule } requires at least ${ count } parameters.`);
    }
  }

  /**
   * Check if it is a valid validator.
   */
  _isAValidator(validator) {
    return this[`validator_${ validator }`] !== undefined;
  }

  // --------------------------------------------------------------------------- [Validators]

  /**
   * Check if the value is a string only with alpha characters.
   *
   * @param value
   * @returns {boolean}
   */
  validator_alpha(value) {
    return typeof value === 'string' && /^[a-zA-Z]*$/.test(value);
  }

  /**
   * Check if the value is a number.
   *
   * @param value
   * @returns {boolean}
   */
  validator_alpha_num(value) {
    return (/^[a-zA-Z0-9]*$/.test(value)
    );
  }

  /**
   * Check if the value is a string only with alpha or (_, -) characters.
   *
   * @param value
   * @returns {boolean}
   */
  validator_alpha_dash(value) {
    return (/^[a-zA-Z0-9-_]*$/.test(value)
    );
  }

  /**
   * Check if the value is an array.
   *
   * @param value
   * @returns {boolean}
   */
  validator_array(value) {
    return Array.isArray(value);
  }

  /**
   * Check if the value is before than the specified date.
   *
   * @param value
   * @param args
   * @returns {*}
   */
  validator_before(value, args) {
    this._requireParameterCount(1, args, 'before');

    // check if the argument are valid
    if (isNaN(Date.parse(args))) {
      throw new Error('the specified argument is not a valid date');
    }

    // check if the value if a date
    if (isNaN(Date.parse(value))) {
      return false;
    }

    // check if the specified date is less than the required date
    return Date.parse(value) < Date.parse(args);
  }

  /**
   * Check if the value is between the two intervals.
   *
   * @param value
   * @param args
   * @returns {*}
   */
  validator_between(value, args) {
    this._requireParameterCount(2, args, 'between');

    // check if the value is valid
    if (typeof value === 'string') {
      return value.length >= args[0] && value.length <= args[1];
    } else if (typeof value === 'number') {
      return value >= args[0] && value <= args[1];
    }

    return false;
  }

  /**
   * Check if the value is a boolean.
   *
   * @param value
   * @returns {boolean}
   */
  validator_boolean(value) {
    return typeof value === 'boolean';
  }

  /**
   * Check if exists a confirmation fields to the testing key with the same name.
   *
   * @param value
   * @param args
   * @param key
   * @returns {*}
   */
  validator_confirmed(value, args, key) {
    // build the confirmation field name
    let confirmationFieldName = `${ key }_confirmation`;

    // check if the confirmation field are not present
    if (this.params[confirmationFieldName] === undefined) {
      return false;
    }

    // check if the values of two fields match
    if (this.params[confirmationFieldName] !== value) {
      return false;
    }

    return true;
  }

  /**
   * Check if the param is a date.
   *
   * @param value
   * @returns {*}
   */
  validator_date(value) {
    if (isNaN(Date.parse(value))) {
      return false;
    }
    return true;
  }

  /**
   * Check if the value is different of the other field.
   *
   * @param value
   * @param args
   * @returns {*}
   */
  validator_different(value, args) {
    this._requireParameterCount(1, args, 'different');

    return value !== this.params[args[0]];
  }

  /**
   * Check if the value is an email.
   *
   * @param value
   * @returns {boolean}
   */
  validator_email(value) {
    return (/^(([^<>()\[\]\\.,;:\s@"]+(\.[^<>()\[\]\\.,;:\s@"]+)*)|(".+"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/.test(value)
    );
  }

  /**
   * Check if the value is filled.
   *
   * @param value
   * @returns {boolean}
   */
  validator_filled(value) {
    return value !== undefined && value !== null && value !== '';
  }

  /**
   * Check if the value are included in the array.
   *
   * @param value
   * @param args
   * @returns {*}
   */
  validator_in(value, args) {
    // check if the validator have a name
    if (args.length === 0) {
      throw new Error('validator needs an array');
    }

    // check if the array contains the value
    return args.indexOf(String(value)) > -1;
  }

  /**
   * Check if the value are not included in the array.
   *
   * @param value
   * @param args
   * @returns {*}
   */
  validator_not_in(value, args) {
    // check if the validator have a name
    if (args.length === 0) {
      throw new Error('validator needs an array');
    }

    // check if the array not contains the value
    return args.indexOf(String(value)) === -1;
  }

  /**
   * Check if the value is an integer.
   *
   * @param value
   * @returns {boolean}
   */
  validator_integer(value) {
    // try parse to pin
    let parsedValue = Number.parseInt(value);

    // check if is a number
    return Number.isInteger(parsedValue);
  }

  /**
   * Check if the value is an IP.
   *
   * @param value
   * @returns {boolean}
   */
  validator_ip(value) {
    return (/^(?!0)(?!.*\.$)((1?\d?\d|25[0-5]|2[0-4]\d)(\.|$)){4}$/.test(value)
    );
  }

  /**
   * Check if the field is a valid JSON.
   *
   * @param value
   * @returns {boolean}
   */
  validator_json(value) {
    try {
      let o = JSON.parse(value);

      if (o && typeof o === 'object' && o !== null) {
        return true;
      }
    } catch (e) {}

    return false;
  }

  /**
   * Check if the parameter match with a max value.
   *
   * @param value
   * @param args
   * @returns {*}
   */
  validator_max(value, args) {
    this._requireParameterCount(1, args, 'max');

    if (typeof value === 'string' || value instanceof Array) {
      return value.length <= args[0];
    } else if (typeof value === 'number') {
      return value <= args[0];
    } else {
      return false;
    }
  }

  /**
   * Check if the parameter match with a min value.
   *
   * @param value
   * @param args
   * @returns {*}
   */
  validator_min(value, args) {
    this._requireParameterCount(1, args, 'min');

    if (typeof value === 'string' || value instanceof Array) {
      return value.length >= args[0];
    } else if (typeof value === 'number') {
      return value >= args[0];
    }

    return false;
  }

  /**
   * Check if the value exists.
   *
   * @param value
   * @returns {boolean}
   */
  validator_required(value) {
    return value !== undefined;
  }

  /**
   * Check if the value matches with a regular expression.
   *
   * @param Mixed value
   * @param Array parameters
   */
  validator_regex(value, parameters) {
    this._requireParameterCount(1, parameters, 'regex');

    // create an RegEx instance and validate
    const regex = new RegExp(parameters[0], parameters[1] || '');
    return regex.test(value);
  }

  /**
   * Check if the value is numeric.
   *
   * @param value
   * @returns {boolean}
   */
  validator_numeric(value) {
    return typeof value === 'number';
  }

  /**
   * Check if the field is required taking into account the parameters.
   *
   * @param value
   * @param args
   * @returns {*}
   */
  validator_required_if(value, args) {
    this._requireParameterCount(2, args, 'required_if');

    // if the args[0] param value is present in the values array the value is required
    if (args.indexOf(String(this.params[args[0]])) > -1) {
      return this.validator_filled(value);
    }

    return true;
  }

  /**
   * The field under validation must be present unless the args[0] is equal to
   * any value.
   *
   * @param value
   * @param args
   * @returns {*}
   */
  validator_required_unless(value, args) {
    this._requireParameterCount(2, args, 'required_unless');

    // if the parameter not have a valid value the current parameter is required
    if (args.indexOf(String(this.params[args[0]])) === -1) {
      return this.validator_filled(value);
    }

    return true;
  }

  /**
   * The field under validation must be present only if any of the other
   * specified fields are present.
   *
   * @param value
   * @param args
   * @returns {*}
   */
  validator_required_with(value, args) {
    this._requireParameterCount(1, args, 'required_with');

    // check if one of the parameters are present
    for (let index in args) {
      // get parameter name
      let paramName = args[index];

      // check if the value is filled
      if (this.params[paramName] !== undefined) {
        return this.validator_filled(value);
      }
    }

    return true;
  }

  /**
   * The field under validation must be present only if all of the other
   * specified fields are present.
   *
   * @param value
   * @param args
   * @returns {*}
   */
  validator_required_with_all(value, args) {
    this._requireParameterCount(2, args, 'required_with_all');

    // check if all the parameters are present
    for (let index in args) {
      // get parameter name
      let paramName = args[index];

      if (this.params[paramName] === undefined) {
        return true;
      }
    }

    // if all the fields are present the fields under validation is required
    return this.validator_filled(value);
  }

  /**
   * The field under validation must be present only when any of the other
   * specified fields are not present.
   *
   * @param value
   * @param args
   * @returns {*}
   */
  validator_required_without(value, args) {
    this._requireParameterCount(1, args, 'required_without');

    // if one of the fields are not present the field under validation is required
    for (let index in args) {
      // get parameter name
      let paramName = args[index];

      if (this.params[paramName] === undefined) {
        return this.validator_filled(value);
      }
    }

    return true;
  }

  /**
   * The field under validation must be present only when all of the other
   * specified fields are not present.
   *
   * @param value
   * @param args
   * @returns {*}
   */
  validator_required_without_all(value, args) {
    this._requireParameterCount(2, args, 'required_without_all');

    for (let index in args) {
      // get parameter name
      let paramName = args[index];

      // if one of the fields are not present we can stop right here
      if (this.params[paramName] !== undefined) {
        return true;
      }
    }

    return this.validator_filled(value);
  }

  /**
   * The given field must match the field under validation.
   *
   * @param value
   * @param args
   * @returns {*}
   */
  validator_same(value, args) {
    this._requireParameterCount(1, args, 'same');

    return this.params[args[0]] === value;
  }

  /**
   * The field under validation must have a size matching the given value.
   *
   * @param value
   * @param args
   */
  validator_size(value, args) {
    this._requireParameterCount(1, args, 'size');

    let length = parseInt(args[0]);

    if (typeof value === 'string' || value instanceof Array) {
      return value.length === length;
    } else if (typeof value === 'number') {
      return value === length;
    } else {
      return false;
    }
  }

  /**
   * The field under validation must be a valid URL.
   *
   * @param value
   * @returns {boolean}
   */
  validator_url(value) {
    return (/^(http|ftp|https):\/\/[\w-]+(\.[\w-]*)+([\w.,@?^=%&amp;:/~+#-]*[\w@?^=%&amp;/~+#-])?$/.test(value)
    );
  }

  // --------------------------------------------------------------------------- [Replacers]

  /**
   * Replace all place-holders for the before rule.
   */
  replace_before(message, attribute, rule, parameters) {
    return message.replace(/:date/ig, parameters[0]);
  }

  /**
   * Replace all place-holders for the between rule.
   */
  replace_between(message, attribute, rule, parameters) {
    const repl = { ':min': parameters[0], ':max': parameters[1] };
    return message.replace(/:min|:max/ig, match => repl[match]);
  }

  /**
   * Replace all place-holders for the different rule.
   */
  replace_different(message, attribute, rule, parameters) {
    return message.replace(/:other/ig, parameters[0]);
  }

  /**
   * Replace all place-holders for the max rule.
   */
  replace_max(message, attribute, rule, parameters) {
    return message.replace(/:max/ig, parameters[0]);
  }

  /**
   * Replace all place-holders for the min rule.
   */
  replace_min(message, attribute, rule, parameters) {
    return message.replace(/:min/ig, parameters[0]);
  }

  /**
   * Replace all place-holders for the required_if rule.
   */
  replace_required_if(message, attribute, rule, parameters) {
    const params = JSON.parse(JSON.stringify(parameters));
    params.shift();

    const repl = { ':other': parameters[0], ':values': params.join(', ') };
    return message.replace(/:other|:values/ig, match => repl[match]);
  }

  /**
   * Replace all place-holders for the required_unless rule.
   */
  replace_required_unless(message, attribute, rule, parameters) {
    const params = JSON.parse(JSON.stringify(parameters));
    params.shift();

    const repl = { ':other': parameters[0], ':values': params.join(', ') };
    return message.replace(/:other|:values/ig, match => repl[match]);
  }

  /**
   * Replace all place-holders for the required_with rule.
   */
  replace_required_with(message, attribute, rule, parameters) {
    return message.replace(/:values/ig, parameters.join(', '));
  }

  /**
   * Replace all place-holders for the required_with_all rule.
   */
  replace_required_with_all(message, attribute, rule, parameters) {
    return message.replace(/:values/ig, parameters.join(', '));
  }

  /**
   * Replace all place-holders for the required_without rule.
   */
  replace_required_without(message, attribute, rule, parameters) {
    return message.replace(/:values/ig, parameters.join(', '));
  }

  /**
   * Replace all place-holders for the required_without_all rule.
   */
  replace_required_without_all(message, attribute, rule, parameters) {
    return message.replace(/:values/ig, parameters.join(', '));
  }

  /**
   * Replace all place-holders for the same rule.
   */
  replace_same(message, attribute, rule, parameters) {
    return message.replace(/:other/i, parameters[0]);
  }

  /**
   * Replace all place-holders for the size rule.
   */
  replace_size(message, attribute, rule, parameters) {
    return message.replace(/:size/i, parameters[0]);
  }

}

/**
 * Validator satellite.
 */
Validator.implicitValidators = ['required_if', 'required', 'required_unless', 'filled', 'required_with', 'required_with_all', 'required_without', 'required_without_all'];
exports.default = class {
  constructor() {
    this.loadPriority = 400;
  }

  /**
   * Satellite priority.
   *
   * @type {number}
   */


  /**
   * Satellite load function.
   *
   * @param api   API reference object.
   * @param next  Callback function.
   */
  load(api, next) {
    // load validator logic into the API object
    api.validator = new Validator(api);

    // finish the load process
    next();
  }

};
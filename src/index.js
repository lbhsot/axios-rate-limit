function AxiosRateLimit (axios) {
  this.queue = []
  this.configQueue = []
  this.debounceRequest = false
  this.timeslotRequests = 0

  this.interceptors = {
    request: null,
    response: null
  }

  this.handleRequest = this.handleRequest.bind(this)
  this.handleResponse = this.handleResponse.bind(this)

  this.enable(axios)
}

function deepEqual (x, y) {
  if (x === y) return true
  if ((typeof x === 'object' && x !== null) &&
      (typeof y === 'object' && y !== null)) {
    if (Object.keys(x).length !== Object.keys(y).length) return false
    for (var prop in x) {
      if (y.hasOwnProperty(prop)) {
        if (!deepEqual(x[prop], y[prop])) return false
      } else {
        return false
      }
    }
    return true
  }
  return false
}

AxiosRateLimit.prototype.getMaxRPS = function () {
  var perSeconds = (this.perMilliseconds / 1000)
  return this.maxRequests / perSeconds
}

AxiosRateLimit.prototype.setMaxRPS = function (rps) {
  this.setRateLimitOptions({
    maxRequests: rps,
    perMilliseconds: 1000
  })
}

AxiosRateLimit.prototype.setRateLimitOptions = function (options) {
  if (options.debounceRequest !== undefined) {
    this.debounceRequest = options.debounceRequest
  }
  if (options.maxRPS) {
    this.setMaxRPS(options.maxRPS)
  } else {
    this.perMilliseconds = options.perMilliseconds
    this.maxRequests = options.maxRequests
  }
}

AxiosRateLimit.prototype.enable = function (axios) {
  function handleError (error) {
    return Promise.reject(error)
  }

  this.interceptors.request = axios.interceptors.request.use(
    this.handleRequest,
    handleError
  )
  this.interceptors.response = axios.interceptors.response.use(
    this.handleResponse,
    handleError
  )
}

AxiosRateLimit.prototype.handleRequest = function (config) {
  return new Promise(function (resolve) {
    if (this.debounceRequest) {
      var find = false
      // eslint-disable-next-line es5/no-for-of
      for (var cur of this.configQueue) {
        if (deepEqual(cur, config)) {
          find = true
          break
        }
      }
      if (!find) {
        this.configQueue.push(config)
        this.push({ resolve: function () { resolve(config) } })
      }
    } else {
      this.push({ resolve: function () { resolve(config) } })
    }
  }.bind(this))
}

AxiosRateLimit.prototype.handleResponse = function (response) {
  this.shift()
  return response
}

AxiosRateLimit.prototype.push = function (requestHandler) {
  this.queue.push(requestHandler)
  this.shiftInitial()
}

AxiosRateLimit.prototype.shiftInitial = function () {
  setTimeout(function () { return this.shift() }.bind(this), 0)
}

function nowTime () {
  var m = new Date()
  return m.getUTCFullYear() + '/' +
      ('0' + (m.getUTCMonth() + 1)).slice(-2) + '/' +
      ('0' + m.getUTCDate()).slice(-2) + ' ' +
      ('0' + m.getUTCHours()).slice(-2) + ':' +
      ('0' + m.getUTCMinutes()).slice(-2) + ':' +
      ('0' + m.getUTCSeconds()).slice(-2)
}

AxiosRateLimit.prototype.shift = function () {
  if (!this.queue.length) return
  if (this.timeslotRequests === this.maxRequests) {
    if (this.timeoutId && typeof this.timeoutId.ref === 'function') {
      this.timeoutId.ref()
    }
    return
  }

  if (this.debounceRequest) {
    this.configQueue.shift()
  }
  var queued = this.queue.shift()
  queued.resolve()
  console.log(nowTime(), queued)

  if (this.timeslotRequests === 0) {
    this.timeoutId = setTimeout(function () {
      this.timeslotRequests = 0
      this.shift()
    }.bind(this), this.perMilliseconds)

    if (typeof this.timeoutId.unref === 'function') {
      if (this.queue.length === 0) this.timeoutId.unref()
    }
  }

  this.timeslotRequests += 1
}

/**
 * Apply rate limit to axios instance.
 *
 * @example
 *   import axios from 'axios';
 *   import rateLimit from 'axios-rate-limit';
 *
 *   // sets max 2 requests per 1 second, other will be delayed
 *   // note maxRPS is a shorthand for perMilliseconds: 1000, and it takes precedence
 *   // if specified both with maxRequests and perMilliseconds
 *   const http = rateLimit(axios.create(), { maxRequests: 2, perMilliseconds: 1000, maxRPS: 2 })
*    http.getMaxRPS() // 2
 *   http.get('https://example.com/api/v1/users.json?page=1') // will perform immediately
 *   http.get('https://example.com/api/v1/users.json?page=2') // will perform immediately
 *   http.get('https://example.com/api/v1/users.json?page=3') // will perform after 1 second from the first one
 *   http.setMaxRPS(3)
 *   http.getMaxRPS() // 3
 *   http.setRateLimitOptions({ maxRequests: 6, perMilliseconds: 150 }) // same options as constructor
 *
 * @param {Object} axios axios instance
 * @param {Object} options options for rate limit, available for live update
 * @param {Number} options.maxRequests max requests to perform concurrently in given amount of time.
 * @param {Number} options.perMilliseconds amount of time to limit concurrent requests.
 * @returns {Object} axios instance with interceptors added
 */
function axiosRateLimit (axios, options) {
  var rateLimitInstance = new AxiosRateLimit(axios)
  rateLimitInstance.setRateLimitOptions(options)

  axios.getMaxRPS = AxiosRateLimit.prototype.getMaxRPS.bind(rateLimitInstance)
  axios.setMaxRPS = AxiosRateLimit.prototype.setMaxRPS.bind(rateLimitInstance)
  axios.setRateLimitOptions = AxiosRateLimit.prototype.setRateLimitOptions
    .bind(rateLimitInstance)

  return axios
}

module.exports = axiosRateLimit

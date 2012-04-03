// Copyright 2012 Google Inc. All Rights Reserved.

/* Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

/**
 * @author
 * Shan Aminzadeh, shan.aminzadeh@gmail.com
 * Arya Bondarian, aryabond@gmail.com
 * Albert Gau, agau@uci.edu
 * Travis Lai, travisrlai@gmail.com
 * Daniel Nguyen, danielnuwin@gmail.com
 *
 * @fileoverview
 * This library is designed to create an easier way to build a custom
 * Google Analytics Dashboard by visualizing data from Google Analytics
 * API with the Google Chart Tools.
 */

// Loads the core chart and table from the Google Visualization.
google.load('visualization', '1', {'packages': ['corechart', 'table']});

// Create namespace for this library if not already created.
var gadash = gadash || {};

/**
 * Refers to the Google Analytics API scope that the user will need
 * authentication for.
 * @const {String}
 */
gadash.SCOPE = 'https://www.googleapis.com/auth/analytics.readonly';

/**
 * List of Chart objects that are queued for rendering.
 * @type {Array}
 */
gadash.listOfCharts = [];

/**
 * Callback executed once the Google APIs Javascript client library has loaded.
 * The function name is specified in the onload query parameter of URL to load
 * this library. After 1 millisecond, checkAuth is called.
 */
window.gadashInit = function() {
  gapi.client.setApiKey(gadash.apiKey);
  window.setTimeout(gadash.checkAuth, 1);
};

/**
 * Sets the API key and Client ID passed by the user.
 * This information can be found in your Google API Console.
 * @param {Object} settings - Contains the API Key and Client ID variables.
 */
gadash.configKeys = function(settings) {
  gadash.apiKey = settings.apiKey;
  gadash.clientId = settings.clientId;
};

/**
 * Uses the OAuth2.0 clientId to query the Google Accounts service
 * to see if the user has authorized. Once complete, handleAuthResults is
 * called.
 */
gadash.checkAuth = function() {
  gapi.auth.authorize(
      {client_id: gadash.clientId, scope: gadash.SCOPE, immediate: true},
      gadash.handleAuthResult);
};

/**
 * Handler that is called once the script has checked to see if the user has
 * authorized access to their Google Analytics data. If the user has authorized
 * access, the analytics api library is loaded and the handleAuthorized
 * function is executed. If the user has not authorized access to their data,
 * the handleUnauthorized function is executed.
 * @param {Object} authResult The result object returned form the authorization
 *     service that determine whether the user has currently authorized access
 *     to their data. If it exists, the user has authorized access.
 */
gadash.handleAuthResult = function(authResult) {
  if (authResult) {
    gapi.client.load('analytics', 'v3', gadash.handleAuthorized);
  } else {
    gadash.handleUnAuthorized();
  }
};

/**
 * Updates the UI once the user has authorized this script to access their
 * data by hiding the authorize button. Also, executes the renderQueue function
 * to render all charts in the listOfCharts queue.
 */
gadash.handleAuthorized = function() {
  var authorizeButton = document.getElementById('authorize-button');
  authorizeButton.style.visibility = 'hidden';

  gadash.renderQueue();
};

/**
 * Updates the UI if a user has not yet authorized this script to access
 * their Google Analytics data. This function changes the visibility of
 * some elements on the screen. It also adds the handleAuthClick
 * click handler to the authorize-button.
 */
gadash.handleUnAuthorized = function() {
  var authorizeButton = document.getElementById('authorize-button');
  authorizeButton.style.visibility = '';
  authorizeButton.onclick = gadash.handleAuthClick;
};

/**
 * Checks to see if user is authenticated, calls handleAuthResult
 * @return {boolean} false.
 * @param {Object} event - event when button is clicked.
 */
gadash.handleAuthClick = function(event) {
  gapi.auth.authorize({client_id: gadash.clientId, scope: gadash.SCOPE,
      immediate: false}, gadash.handleAuthResult);
  return false;
};

/**
 * Renders any Chart objects that are in the listOfCharts queue
 * after the Google Analytics API is loaded.
 */
gadash.renderQueue = function() {
  for (var i = 0; i < gadash.listOfCharts.length; i++) {
    gadash.listOfCharts[i].render();
  }
};

/**
 * A Chart object is the primary object in this library.
 * A Chart takes in a config object that contains all the
 * params of the chart. Also changes start and end date of
 * the query, if last-n-days is set in the config.
 * @param {Object} config - Contains all configuration variables
 *     of a Chart object.
 * @return {Object} this - returns this Chart instance.
 * @constructor
 */
gadash.Chart = function(config) {
  this.config = config;

  if (this.config['last-n-days']) {
    this.config.query['end-date'] = gadash.lastNDays(0);
    this.config.query['start-date'] =
        gadash.lastNDays(this.config['last-n-days']);
  }

  return this;
};

/**
 * Creates a DataTable object using a GA response.
 * @param {Object} resp - A Google Analytics response.
 * @return {Object} data - A Google DataTable object populated
 *     with the GA response data.
 */
gadash.Chart.prototype.getDataTable = function(resp) {
  var data = new google.visualization.DataTable();
  var numOfColumns = resp.columnHeaders.length;
  var numOfRows;

  // Throw an error if there are no rows returned.
  if (resp.rows && resp.rows.length) {
    numOfRows = resp.rows.length;
  } else {
    this.defaultOnError('No rows returned for that query.');
  }

  /*
   * Looks at the resp column headers to set names and types for each column.
   * Since bar and column chart don't support date object, set type as string
   * rather than a Date.
   */
  for (var i = 0; i < numOfColumns; i++) {
    var dataType = resp.columnHeaders[i].dataType;
    var name = resp.columnHeaders[i].name;

    if (name == 'ga:date' &&
        !(this.config.type == 'ColumnChart' ||
            this.config.type == 'BarChart')) {
      dataType = 'date';
    } else if (dataType == 'STRING') {
      dataType = 'string';
    } else {
      dataType = 'number';
    }
    data.addColumn(dataType, this.formatGAString(name));
  }

  /*
   * Populates the rows by using the resp.rows array. If the type
   * is an int then parse the INT. If it is a percent, then round
   * to last two decimal places and store as INT.
   */
  for (var i = 0; i < numOfRows; i++) {
    var arrayMetrics = [];
    for (var j = 0; j < numOfColumns; j++) {
      var name = resp.columnHeaders[j].name;
      var dataType = resp.columnHeaders[j].dataType;

      if (name == 'ga:date' &&
          !(this.config.type == 'ColumnChart' ||
              this.config.type == 'BarChart')) {
        arrayMetrics.push(gadash.stringToDate(resp.rows[i][j]));
      } else if (dataType == 'INTEGER') {
        arrayMetrics.push(parseInt(resp.rows[i][j]));
      } else if (dataType == 'PERCENT' || dataType == 'TIME' ||
          dataType == 'FLOAT') {
        arrayMetrics.push(Math.round((resp.rows[i][j]) * 100) / 100);
      } else {
        arrayMetrics.push(resp.rows[i][j]);
      }
    }
    data.addRow(arrayMetrics);
  }

  return data;
};

/**
 * Checks to see if the type of chart in the config is valid.
 * If it is, get its chart instance, else return a Table instance.
 * @return {Object} visualization - returns the Chart instance.
 */
gadash.Chart.prototype.getChart = function() {
  var div = document.getElementById(this.config.divContainer);

  if (google.visualization[this.config.type]) {
    return new google.visualization[this.config.type](div);
  }

  return new google.visualization.Table(div);
};

/**
 * Draws a chart to its declared div using a DataTable.
 * @param {Object} chart - The Chart instance you wish to draw the data into.
 * @param {Object} dataTable - The Google DataTable object holding
 *    the response data.
 */
gadash.Chart.prototype.draw = function(chart, dataTable) {
  chart.draw(dataTable, this.config.chartOptions);
};

/**
 * Default callback for creating Google Charts with a response. First, the
 * response is put into a DataTable object Second, the corresponding chart
 * is returned. The two are then combined to draw a chart that is populated
 * with the GA data.
 * @param {Object} resp - A Google Analytics API JSON response.
 */
gadash.Chart.prototype.defaultOnSuccess = function(resp) {
  var dataTable = this.getDataTable(resp);
  var chart = this.getChart();
  this.draw(chart, dataTable);
};

/**
 * Binds a method to it's object.
 * @param {Object} object The main object to bind to.
 * @param {Object} method The method to bind to the object.
 * @return {function} the function passed in boound to the object parameter.
 */
gadash.Chart.prototype.bindMethod = function(object, method) {
  return function() {
    return method.apply(object, arguments);
  };
};

/**
 * First checks to see if the GA library is loaded. If loaded, render
 * the chart by executing the query and callback function. If it is not
 * loaded, push the chart onto a queue of charts to render once loaded.
 * @return {Object} this - returns instance of this chart object.
 */
gadash.Chart.prototype.render = function() {

  // Render Chart if client library is loaded, else add to queue.
  if (gapi.client.analytics) {
    var request = gapi.client.analytics.data.ga.get(this.config.query);
    request.execute(this.bindMethod(this, this.callback));
  } else {
    gadash.listOfCharts.push(this);
  }

  return this;
};

/**
 * Callback function that is called after a GA query is executed.
 * First, the function checks to see if there are any errors on the
 * response. Then check to see if a onSuccess function was declared
 * in the config. If present, call onSuccess by first binding it to
 * this (ie this chart object instance). If not defined, just use
 * the default callback. The entire JSON response from the API
 * is passed to either defined or default callback.
 * @param {Object} response - Google Analytics API JSON response.
 */
gadash.Chart.prototype.callback = function(response) {
  if (response.error) {
    this.defaultOnError(response.error.code + ' ' + response.error.message);
  } else {

    if (this.config.onSuccess) {
      this.bindMethod(this, this.config.onSuccess)(response);
    } else {
      this.defaultOnSuccess(response);
    }
  }
};

/**
 * Formats the Google Metrics and Dimensions into readable strings
 * Strips away the 'ga' and capitalizes first letter. Also puts a space
 * between any lowercase and capital letters.
 * ie: "ga:percentNewVisits" ---> "Percent New Visits"
 * @param {String} gaString - the String name of Metric/Dimension from GA.
 * @return {String} newString - Metric/Dimension formatted nicely.
 */
gadash.Chart.prototype.formatGAString = function(gaString) {
  var newString = gaString.substring(3);
  newString = newString.charAt(0).toUpperCase() + newString.slice(1);

  // Check for a capital letter in the string. If found,
  // put a space between that char and the char before it.
  for (var i = 1; i < newString.length; i++) {
    if (newString.charAt(i) == newString.charAt(i).toUpperCase()) {
      var left = newString.substring(0, i);
      var right = newString.substring(i, newString.length);
      newString = [left, right].join(' ');
      i++;
    }
  }

  return newString;
};

/**
 * Checks to see if onError parameter is set in config. If it is,
 * use the user defined error function else check to see if an error
 * div is created. If not, create an error div. Print error message
 * to the error div.
 * @param {String} message - error message to print.
 */
gadash.Chart.prototype.defaultOnError = function(message) {

  // If onError param exists, use that as error handling function.
  if (this.config.onError) {
    this.config.onError(message);
  } else {

    var errorDiv = document.getElementById('errors');

    // Create error div if not already made.
    if (!errorDiv) {
      errorDiv = document.createElement('div');
      errorDiv.style.color = 'red';
      errorDiv.setAttribute('id', 'errors');
      errorDiv.innerHTML = 'ERRORS:' + '<br />';
      document.body.appendChild(errorDiv);
    }

    // Prints chart divContainer and message to error div.
    errorDiv.innerHTML += this.config.divContainer + ' error: ' +
        message + '<br />';
  }
};

/**
 * Utility method to return the lastNdays from today in the format yyyy-MM-dd.
 * @param {Number} n The number of days in the past from tpday that we should
 *     return a date. Value of 0 returns today.
 * @return {String} date - The adjusted date value represented as a String.
 */
gadash.lastNDays = function(n) {
  var today = new Date();
  var before = new Date();
  before.setDate(today.getDate() - n);

  var year = before.getFullYear();

  var month = before.getMonth() + 1;
  if (month < 10) {
    month = '0' + month;
  }

  var day = before.getDate();
  if (day < 10) {
    day = '0' + day;
  }

  return [year, month, day].join('-');
};

/**
 * Utility method to return Date from a String in the format yyyy-MM-dd.
 * This function is used for a Chart that has a Time Series.
 * @param {String} date - The String representation of the date.
 * @return {Date} date - Corresponding JS Date object.
 */
gadash.stringToDate = function(date) {
  var year = date.substring(0, 4);
  var month = date.substring(4, 6);
  var day = date.substring(6, 8);

  if (month < 10) {
    month = month.substring(1, 2);
  }

  month = month - 1;

  if (day < 10) {
    day = day.substring(1, 2);
  }

  var dateObj = new Date(year, month, day);
  return dateObj;
};

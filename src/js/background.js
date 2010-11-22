/*
 * background.js
 *
 * Author: dave@bit155.com
 *
 * ---------------------------------------------------------------------------
 * 
 * Copyright (c) 2010, David Heaton
 * All rights reserved.
 * 
 * Redistribution and use in source and binary forms, with or without
 * modification, are permitted provided that the following conditions are met:
 * 
 *     * Redistributions of source code must retain the above copyright notice,
 *       this list of conditions and the following disclaimer.
 *  
 *     * Redistributions in binary form must reproduce the above copyright
 *       notice, this list of conditions and the following disclaimer in the
 *       documentation and/or other materials provided with the distribution.
 *  
 *      * Neither the name of bit155 nor the names of its contributors
 *        may be used to endorse or promote products derived from this software
 *        without specific prior written permission.
 *  
 * THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS"
 * AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE
 * IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE
 * DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE LIABLE
 * FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL
 * DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR
 * SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER
 * CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY,
 * OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE
 * OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
 */
 
// oauth
var oauth = ChromeExOAuth.initBackgroundPage({
  'request_url': 'https://www.google.com/accounts/OAuthGetRequestToken',
  'authorize_url': 'https://www.google.com/accounts/OAuthAuthorizeToken',
  'access_url': 'https://www.google.com/accounts/OAuthGetAccessToken',
  'consumer_key': 'anonymous',
  'consumer_secret': 'anonymous',
  'scope': 'https://docs.google.com/feeds/',
  'app_name': 'Scraper'
});

chrome.extension.onRequest.addListener(function(request, sender, sendResponse) {
  var command = request.command;
  var payload = request.payload;
  
  if (command === 'scraperScrapeTab') {
    // forward requests for "scraperScrape" to the appropriate tab
    chrome.tabs.sendRequest(parseInt(payload.tab, 10), { command: 'scraperScrape', payload: payload.options }, sendResponse);
  } else if (command === 'scraperSpreadsheet') {
    // export spreadsheet to google docs
    oauth.authorize(function() {
      var url = 'https://docs.google.com/feeds/default/private/full';
      var request = {
        'method': 'POST',
        'headers': {
          'GData-Version': '3.0',
          'Content-Type': 'text/csv',
          'Slug': payload.title
        },
        'parameters': {
          'alt': 'json'
        },
        'body': payload.csv
      };
      
      var callback = function(response, xhr) {
        if (xhr.status == 401) {
          // unauthorized, token probably bad so clear it
          oauth.clearTokens();
          sendResponse({error: 'Unauthorized. Please try again.'});
        } else {
          try {
            var json = JSON.parse(response);
        
            // open page
            if (json && json.entry && json.entry.link) {
              var links = json.entry.link;
              for (var i = 0; i < links.length; i++) {
                if (links[i].rel === 'alternate' && links[i].type === 'text/html') {
                  chrome.tabs.create({
                    url: links[i].href
                  });
                }
              }
            }
          
            // forward response to the caller
            sendResponse(json);
          } catch (error) {
            sendResponse({error:error});
          }
        }
      };
      
      oauth.sendSignedRequest(url, callback, request);
    });
  }
});

function createPopupFunction(url) {
  return function(info, tab) {
    var active;
  
    // can't work on extensions pages
    if (tab.url.indexOf("https://chrome.google.com/extensions") == 0 || tab.url.indexOf("chrome://") == 0) {
      alert("Scraper is not permitted to work on the Google Chrome extensions page for security reasons.");
      return;
    }
  
    chrome.tabs.sendRequest(tab.id, { command: 'scraperSelect' }, function(response) {
      active = true;
      chrome.windows.create({ 
        url: chrome.extension.getURL(url) 
          + "?tab=" + tab.id
          + "&options=" + encodeURIComponent(JSON.stringify(response)),
        type: 'popup',
        width: Math.max(650, parseInt((localStorage['viewer.width'] || '960'), 10)),
        height: Math.max(250, parseInt((localStorage['viewer.height'] || '400'), 10))
      });
    });
  
    // offer to reload page if scraping didn't work
    setTimeout(function() {
      if (!active && confirm('You need to reload this page before you can use Scraper. Press ok if you would like to reload it now, or cancel if not.')) {
        chrome.tabs.update(tab.id, {url: "javascript:window.location.reload()"});
      }
    }, 500);
  };
};

// context menus
var scrapeSimilarItem = chrome.contextMenus.create({
  title: "Scrape similar...",
  contexts: ['all'],
  onclick: createPopupFunction('viewer.html')
});

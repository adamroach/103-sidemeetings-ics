#!/usr/local/bin/node
// vi:syntax=javascript

/* **********************************************************************
  MIT License

  Copyright (c) 2018 Adam Roach

  Permission is hereby granted, free of charge, to any person obtaining a copy
  of this software and associated documentation files (the "Software"), to deal
  in the Software without restriction, including without limitation the rights
  to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
  copies of the Software, and to permit persons to whom the Software is
  furnished to do so, subject to the following conditions:

  The above copyright notice and this permission notice shall be included in all
  copies or substantial portions of the Software.

  THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
  IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
  FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
  AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
  LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
  OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
  SOFTWARE.

********************************************************************** */

const meetingsUrl =
  'https://trac.ietf.org/trac/ietf/meeting/wiki/103sidemeetings';

// Mapping from weekday to day of month for IETF 103
const day = {
  'MONDAY':    [2018, 11, 5],
  'TUESDAY':   [2018, 11, 6],
  'WEDNESDAY': [2018, 11, 7],
  'THURSDAY':  [2018, 11, 8],
  'FRIDAY':    [2018, 11, 9],
};

const timezone = "+0700"

const fetch = require('node-fetch');
const HTMLParser = require('node-html-parser');
const ical = require('ical-generator');

(async function main() {
  try {
    const meetingsHtml = await (await fetch(meetingsUrl)).text();
    const root = HTMLParser.parse(meetingsHtml);
    const wikipage = root.querySelector("#wikipage");
    let weekday = '';
    let room = '';
    let events = [];

    wikipage.childNodes.forEach(e => {

      // Weekday names and room names appear in H2 tags.
      if (e.tagName == 'h2') {
        let result;
        if (e.firstChild.rawText &&
            (result = e.firstChild.rawText.match(/Room: (.*)/))) {
          room = result[1];
        } else if (e.id.match(/DAY$/)) {
          weekday = e.id;
        }
      }

      // if we find a table, process it to find room reservations
      if (e.tagName == 'table') {
        events = events.concat(processTable(room, weekday, e));
      }
    });

/*
    ics.createEvents(events, (err, value) => {
      if (err) { throw err; }
      console.log(value);
    });
*/
    const cal = createCalendar(events);
    console.log(cal.toString());

  } catch(e) {
    console.log("Exception: " + e);
  }
})();

Object.defineProperty(Array.prototype, "last", {
  get: function() { return this.slice(-1)[0] }
});

function processTable (room, weekday, table) {
  let events = [];

  table.childNodes.forEach(tr => {
    const [time, title, area, contact, description, information] =
      tr.childNodes.map(x => x.rawText.trim());

    if (typeof(time) == 'string' && time.length && typeof(title) == 'string') {
      const [hour, minute] = time.split(':').map(x => parseInt(x, 10));

      const event = {
        title: title,
        location: room,
        start: day[weekday].concat([hour, minute]),
        description: description,
      };

      if (typeof(information) == 'string' && information.length) {
        event.description += "\n\n" + information;
      }

      if (typeof(contact) == 'string' && contact.length) {
        event.description += "\n\nFor more information, contact " + contact;
      }

      // If this event is different than the previous one, insert an
      // end time into the previous event
      if (events.length && events.last.title != event.title &&
          events.last.end == undefined) {
        events.last.end = event.start;
      }

      // If this event has a valid title and the title is different
      // than the previous event, then insert it into the list of events.
      if (title && title.length && title != "NOT AVAILABLE" &&
          (events.length == 0 || title != events.last.title)) {
        events.push(event);
      }

    }
  });

  return events;
}


// Convert from format used by 'ics' module to 'ical-generator' module
function createCalendar(events){

  function isoDateReducer (acc, cur, idx) {
    const delim = ['','-','-','T',':',':','.'];
    const width = [4,2,2,2,2,2,2];
    return acc + delim[idx] + cur.toString().padStart(width[idx],'0');
  }

  const cal = ical({
    domain: 'ietf.org',
  });

  events.forEach(e => {
    let start = new Date(e.start.reduce(isoDateReducer) + timezone);
    let end = e.end ? new Date(e.end.reduce(isoDateReducer) + timezone)
                    : new Date(start + 60 * 60 * 1000);

    cal.createEvent({
      summary: e.title,
      description: e.description,
      location: e.location,
      timestamp: new Date(),
      start: start,
      end: end,
    });
  });

  return cal;
}

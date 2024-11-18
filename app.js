import express from 'express';
import bodyParser from 'body-parser';
import nunjucks from 'nunjucks';
import moment from 'moment';
import path from 'path';
import { fileURLToPath } from 'url';
import { compileCss } from './compileCss.js';

const app = express();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

import { AtpAgent } from '@atproto/api';

// Set up App
nunjucks.configure(__dirname + '/views/', {
  autoescape: true,
  express: app,
  noCache: true,
  watch: true
});

app.set('view engine', 'nunjucks');
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

const sassOptions = {
  src: path.join(__dirname, '/sass'),
  dest: path.join(__dirname, '/public/css')
};

compileCss(sassOptions);

// The static middleware must come after the sass middleware
app.use(express.static( path.join( __dirname, 'public' ) ) );

var env = process.env.NODE_ENV || 'development'

if (env == 'production') {
  var consumer_key = process.env.CONSUMER_KEY,
      consumer_secret = process.env.CONSUMER_SECRET,
      bearer_token = process.env.BEARER_TOKEN;
} else {
  //
}

app.get("/", function(req, res) {
  res.render('index.html');
});

app.get('/info(/:handle)?', async function(req, res) {
  if (req.params.handle == undefined) {
    if (req.query.handle != undefined) {
      res.redirect('/info/'+req.query.handle);
      return;
    } else {
      // error page
      var error = "You need to specify a handle";
      res.render('error.html', { error: error });
      return;
    }
  }

  const bsky = new AtpAgent({
    service: 'https://public.api.bsky.app'
  })
  const params = { actor: req.params.handle };
  const response = await bsky.getProfile(params);
  
  console.log(response)

  if (response.success) {
    const profile = response.data
    /* 
    data: {
      did: 'did:plc:wez2ivc3yh75q3ejlas7kcqv',
      handle: 'alextorrance.co.uk',
      displayName: 'Alex Torrance',
      avatar: 'https://cdn.bsky.app/img/avatar/plain/did:plc:wez2ivc3yh75q3ejlas7kcqv/bafkreih2rxfwejxicl5hx4y5iyy4objin2n7acxzvsawssjm6gjjchqddq@jpeg',
      associated: {
        lists: 0,
        feedgens: 0,
        starterPacks: 0,
        labeler: false,
        chat: [Object]
      },
      labels: [],
      createdAt: '2023-09-02T20:50:08.224Z',
      description: 'The Idiot',
      indexedAt: '2024-01-20T05:46:21.753Z',
      banner: 'https://cdn.bsky.app/img/banner/plain/did:plc:wez2ivc3yh75q3ejlas7kcqv/bafkreih2rxfwejxicl5hx4y5iyy4objin2n7acxzvsawssjm6gjjchqddq@jpeg',
      followersCount: 365,
      followsCount: 380,
      postsCount: 283
    },
    */

    const now = moment();
    const date_created = moment(profile.createdAt);

    const age = getDateDifference(now, date_created);
    const ageDays = now.diff(date_created, 'days');
    const ageYears = now.diff(date_created, 'years');
    const nextAnniversary = getNextOccurance(date_created);
    const nextAnniversaryString = getDateDifference(now, nextAnniversary);
    const anniversaryDays = Math.abs(now.diff(nextAnniversary, 'days'));

    const postCount = profile.postsCount;
    const averagePosts = (postCount / ageDays).toFixed(2);

    const nextMilestone = getNextMilestone(postCount);
    const postDifference = nextMilestone - postCount;
    const postTimes = Math.ceil(postDifference / anniversaryDays);

    const data = {
      name: profile.displayName,
      handle: profile.handle,
      age: age,
      ageYears: ageYears,
      nextAnniversary: nextAnniversaryString,
      postCount: postCount,
      averagePosts: averagePosts,
      nextMilestone: nextMilestone,
      postDifference: postDifference,
      postTimes: postTimes
    }

    console.log(data)

    res.render('info.html', data);
  } else {
    // console.log(error);
    res.render('error.html', { error: response.error });
  }
});

var getNextOccurance = function(date) {
  var now = moment();
  var input = moment(date);
  var output = moment(input).year(now.year());

  if (input.month() < now.month()) {
    // next year
    output.year(now.year() + 1);
  } else if (input.month() > now.month()) {
    // do nothing
  } else if (input.month() == now.month()) {
    if (input.day() < now.day()) {
      // next year
      output.year(now.year() + 1);
    } else if (input.day() >= now.day()) {
      // do nothing
    }
  }
  return output;
}

var getDateDifference = function(date1, date2) {
  var date1 = moment(date1), date2 = moment(date2);

  var years = date1.diff(date2, 'year');
  date2.add(years, 'years');

  var months = date1.diff(date2, 'months');
  date2.add(months, 'months');

  var days = date1.diff(date2, 'days');

  years = Math.abs(years);
  months = Math.abs(months);
  days = Math.abs(days);

  var string = "";
  if (years > 0) {
    string += years + ' year';
    if (years > 1) {
      string += 's';
    }
  }

  if (months > 0) {
    if (years > 0) {
      if (days > 0) {
        string += ', ';
      } else {
        string += ' and ';
      }
    }
    string += months + ' month';
    if (months > 1) {
      string += 's';
    }
  }

  if (days > 0) {
    if (years > 0 || months > 0) {
      string += ' and ';
    }
    string += days + ' day';
    if (days > 1) {
      string += 's';
    }
  }

  return string;
}

const getNextMilestone = function(n, y=0) {
  const x = String(n).length;
  if (y==0) {
    y = "1";
    while (y.length < x) {
      y += "0";
    }
  }

  const z = Math.ceil(n/y) * y;

  return z;
}

var nunjucksEnv = new nunjucks.Environment();

nunjucksEnv.addFilter('formatNumber', function(n) {
  return n.toLocaleString();
});

nunjucksEnv.addFilter('formatOrdinal', function(n) {
  var ord = "";
  if (n == 1) {
    ord = "st";
  } else if (n == 2) {
    ord = "nd";
  } else if (n == 3) {
    ord = "rd";
  } else {
    ord = "th";
  }

  return n+ord;
});

nunjucksEnv.express(app);

var port = process.env.PORT || 8080;

app.listen(port, function() {
  console.log('App running on port '+port);
  console.log('src is: ' + sassOptions.src);
  console.log('dest is: ' + sassOptions.dest);
});

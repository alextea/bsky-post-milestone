import express from 'express';
import bodyParser from 'body-parser';
import nunjucks from 'nunjucks';
import moment from 'moment';
import path from 'path';
import { fileURLToPath } from 'url';
import { compileCss } from './compileCss.js';
import { AtpAgent } from '@atproto/api';
import { body, validationResult } from 'express-validator';

const app = express();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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

app.use((req, res, next) => {
  res.locals.siteHost = req.get('host');
  next();
});

app.get("/", (req, res) => {
  res.render('index.html');
});

app.post('/',
  body('handle')
    .trim()
    .notEmpty().withMessage("Handle cannot be blank")
    .escape()
    .customSanitizer((value) => {
      return (value.startsWith('@')) ? value.substring(1) : value
    })
    .isURL({ require_protocol: false, allow_fragments: false, allow_query_components: false })
    .withMessage("Handle is not correct format"),
  (req, res) => {
    const result = validationResult(req)
    if (result.isEmpty()) {
      res.redirect(`/info/${req.body.handle}`)
    } else {
      console.log(result.array({ onlyFirstError: true }))
      res.render('index.html', { handle: req.body.handle, errors: result.array() })
    }
})

const shareTypes = ['milestone', 'progress', 'anniversary'];

const bsky = new AtpAgent({
  service: 'https://public.api.bsky.app'
})

const getProfileStats = async (handle) => {
  const response = await bsky.getProfile({ actor: handle });
  const profile = response.data;

  const now = moment().startOf('day');
  const date_created = moment(profile.createdAt).startOf('day');

  const age = getDateDifference(now, date_created);
  const ageDays = Math.max(now.diff(date_created, 'days'), 1);
  const ageYears = now.diff(date_created, 'years');
  const isAnniversary = ageYears > 0 && date_created.month() == now.month() && date_created.date() == now.date();
  const nextAnniversary = getNextOccurance(date_created);
  const nextAnniversaryString = getDateDifference(now, nextAnniversary);
  const anniversaryDays = nextAnniversary.diff(now, 'days');

  const postCount = profile.postsCount;
  const averagePosts = (postCount / ageDays).toFixed(2);

  const lastMilestone = getLastMilestone(postCount);
  const nextMilestone = getNextMilestone(postCount + 1);
  const postDifference = nextMilestone - postCount;
  const postTimes = Math.ceil(postDifference / anniversaryDays);

  return {
    did: profile.did,
    name: profile.displayName,
    handle: profile.handle,
    avatar: profile.avatar,
    createdAt: profile.createdAt,
    age: age,
    ageYears: ageYears,
    isAnniversary: isAnniversary,
    nextAnniversary: nextAnniversaryString,
    anniversaryDays: anniversaryDays,
    postCount: postCount,
    averagePosts: averagePosts,
    lastMilestone: lastMilestone,
    nextMilestone: nextMilestone,
    postDifference: postDifference,
    postTimes: postTimes
  }
}

app.get('/info{/:handle}', async (req, res) => {

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

  try {
    const data = await getProfileStats(req.params.handle);
    console.log(data)
    res.render('info.html', data);
  } catch (err) {
    console.error(err)
    res.render('error.html', err);
  }
});

app.get('/api/info/:handle', async (req, res) => {
  try {
    res.json(await getProfileStats(req.params.handle));
  } catch (err) {
    console.error(err)
    res.status(err.status || 500).json({ error: err.error || 'Error', message: err.message });
  }
});

app.get('/social-share/:milestone', (req, res) => {
  res.render('social-share.html', { milestone: req.params.milestone })
})

app.get('/social-share/:handle/:type', async (req, res) => {
  if (!shareTypes.includes(req.params.type)) {
    res.status(404).render('error.html', { error: "Unknown share type" });
    return;
  }

  try {
    const data = await getProfileStats(req.params.handle);
    // The bot passes the milestone it is celebrating, in case the user has posted since
    const milestone = parseInt(req.query.milestone) || data.lastMilestone;
    res.render('social-share.html', { ...data, type: req.params.type, milestone: milestone });
  } catch (err) {
    console.error(err)
    res.status(err.status || 500).render('error.html', err);
  }
})

// Returns the next occurrence of the date's day and month, after today
var getNextOccurance = (date) => {
  var now = moment().startOf('day');
  var output = moment(date).startOf('day').year(now.year());

  if (output.isSameOrBefore(now)) {
    // next year
    output.year(now.year() + 1);
  }
  return output;
}

var getDateDifference = (date1, date2) => {
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

// Milestones are every power of ten up to 1,000, then every 1,000
const getMilestoneStep = (n) => {
  return Math.pow(10, Math.min(String(n).length, 4) - 1);
}

const getNextMilestone = (n) => {
  const y = getMilestoneStep(n);
  return Math.ceil(n/y) * y;
}

const getLastMilestone = (n) => {
  const y = getMilestoneStep(n);
  return Math.floor(n/y) * y;
}

var nunjucksEnv = new nunjucks.Environment();

nunjucksEnv.addFilter('formatNumber', (n) => {
  return n.toLocaleString();
});

nunjucksEnv.addFilter('formatOrdinal', (n) => {
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

// The bot account's handle, shown on pages and share images when set
nunjucksEnv.addGlobal('botHandle', process.env.BOT_HANDLE);

// Umami analytics, only included when both are set
nunjucksEnv.addGlobal('umamiUrl', process.env.UMAMI_URL);
nunjucksEnv.addGlobal('umamiWebsiteId', process.env.UMAMI_WEBSITE_ID);

nunjucksEnv.express(app);

var port = process.env.PORT || 8080;

app.listen(port, function() {
  console.log('App running on port '+port);
  console.log('src is: ' + sassOptions.src);
  console.log('dest is: ' + sassOptions.dest);
});

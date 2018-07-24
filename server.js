/* Setting things up. */
var path = require('path'),
    express = require('express'),
    app = express(),   
    Twit = require('twit'),
    config = {
    /* Be sure to update the .env file with your API keys. See how to get them: https://botwiki.org/tutorials/how-to-create-a-twitter-app */      
      twitter: {
        consumer_key: process.env.CONSUMER_KEY,
        consumer_secret: process.env.CONSUMER_SECRET,
        access_token: process.env.ACCESS_TOKEN,
        access_token_secret: process.env.ACCESS_TOKEN_SECRET
      }
    },
    T = new Twit(config.twitter),
    stream = T.stream('statuses/sample'),
    FeedParser = require('feedparser'),
    request = require('request'),
    moment = require('moment-timezone');
moment.tz.setDefault(process.env.TIMEZONE||'Europe/London');
app.use(express.static('public'));

const signed = `\n(❤️🤖)${process.env.HASHTAG?'\n#'+process.env.HASHTAG:''}`

/* You can use uptimerobot.com or a similar site to hit your /BOT_ENDPOINT to wake up your app and make your Twitter bot tweet. */

app.all("/" + process.env.BOT_ENDPOINT, function (request, response) {//console.log(moment(),afterMidday(moment()))
    T.get('search/tweets', { q: 'yearinfractions', count: 100 }, function(err, data, _response) {
      const isAfterEightAm = moment().isAfter(moment().set('hour',8).set('minute',0),'minute')
      const didPostToday = data.statuses.filter(c=>c.user.screen_name=='yearinfractions').map(c=>moment().isSame(c.created_at,'day')).reduce((a,b)=>(a||b),false)
      
      if(isAfterEightAm && !didPostToday){
        sendDM(`tried to tweet at ${moment().format()}! After 8AM? ${isAfterEightAm}! Already Posted Today? ${didPostToday}
(8AM today is ${moment().set('hour',8).set('minute',0).format()})`,process.env.DM_AT)
        sendTweet({status:constructFractionString()}, response)
      }
      else response.send("Don't tweet right now"+" --- "+moment().format())
    })
});

app.all("/check-output", function (request, response) {
  if(request._parsedUrl.query && !isNaN(parseInt(request._parsedUrl.query))) response.send(JSON.stringify(fractionThruYear(parseInt(request._parsedUrl.query),moment().isLeapYear())))
  else response.send(JSON.stringify(fractionThruYear(moment().dayOfYear(),moment().isLeapYear())))
});

app.all("/day-of-year", function (request, response) {
  response.send(moment().dayOfYear()+' + '+moment().isLeapYear())
});

app.all("/dm-me/" + process.env.BOT_ENDPOINT,(req,res)=>{
  //console.log(req._parsedUrl.query)
  sendDM(req._parsedUrl.query||'test!',process.env.DM_AT,res)
})

function sendTweet(tweet,response){
  var resp = response;
  T.post('statuses/update', tweet, function(err, data, response) {
    if (err&&!err.draw){ //code 187
      resp.sendStatus(err.code&&err.code==187?err.statusCode:500);
      console.log('Error!');
      console.log(err);
    }
    else{
      //pubdate
      resp.sendStatus(200);
    }
  });
}

function sendDM(_message,recipient,response){
  var resp = response;
  
  T.post("direct_messages/new", {
    user_id: recipient,
    text: _message
  },function(err, data, response) {
    if (err&&!err.draw){ //code 187
      if(resp)resp.sendStatus(err.code&&err.code==187?err.statusCode:500);
      console.log('Error!');
      console.log(err);
    }
    else{
      if(resp)resp.sendStatus(200);
    }
  });
  
  /*var message={
  "event": {
    "type": "message_create",
    "message_create": {
      "target": {
        "recipient_id": recipient
      },
      "message_data": {
        "text": _message,
      }
    }
  }
  }
  T.post('direct_messages/events/new', message, function(err, data, response) {
    if (err&&!err.draw){ //code 187
      if(resp)resp.sendStatus(err.code&&err.code==187?err.statusCode:500);
      console.log('Error!');
      console.log(err);
    }
    else{
      console.log(data)
      if(resp)resp.send(response)//resp.sendStatus(200);
    }
  });*/
}

function drawTweet(imgURL,tweet,response,altText = "bot shared image"){ //TODO: handle base64 encoded dataURIs
  request({url: imgURL, encoding: 'base64'}, function (err, res, body) {
        if (!err && res.statusCode == 200) {
            // first we must post the media to Twitter
            T.post('media/upload', { media_data: body }, function (err, data, response) {
              // now we can assign alt text to the media, for use by screen readers and
              // other text-based presentations and interpreters
              var mediaIdStr = data.media_id_string
              //var altText = "bot shared image"
              var meta_params = { media_id: mediaIdStr, alt_text: { text: altText } }
            
              T.post('media/metadata/create', meta_params, function (err, data, _response) {
                if (!err) {
                  sendTweet({status:tweet.status, media_ids: [mediaIdStr]}, response)
                }
                else response.sendStatus(500)
              })
            })
        } else {
            response.sendStatus(500)
        }
    });
}

var listener = app.listen(process.env.PORT, function () {
  console.log('Your bot is running on port ' + listener.address().port);
});

function constructFractionString(){
  const fraction=fractionThruYear(moment().dayOfYear(),moment().isLeapYear())
  return `Today, we're ${fraction.approximate?'approximately ':''}${fraction.numerator}/${fraction.denominator} through the year!`
}

function fractionThruYear(day,isLeapYear){
  var days_in_year=365+(isLeapYear?1:0);
  var i=1; var closest_match=undefined; var closest_match_value=undefined;
  while(i<=days_in_year){
    var closeness = day/days_in_year*i
    if(!closest_match_value || closest_match_value%1<closeness%1){
      closest_match=i
      closest_match_value=closeness
    }else if(closeness==1 || (i!==days_in_year && closeness%1==0)){//i!==days_in_year && closeness%1==0){
      closest_match=i
      closest_match_value=closeness
      break
    }
    i++
  }
  //console.log('day ',day,' is approximately ',Math.ceil(closest_match_value),'/',closest_match,'through the year (to a closeness of ',(closest_match_value%1).toPrecision(3),')')
  return {
    day:day,
    numerator:Math.ceil(closest_match_value),
    denominator:closest_match,
    closeness:(closest_match_value%1).toPrecision(3),
    approximate:closest_match_value%1>0
  }
}
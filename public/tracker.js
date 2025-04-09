//////////////////////////////
// Global Variables
//////////////////////////////

let pages = [];
let currentPage;

let game;
let mainMenu;
let playbackMenuRugby;
let playbackMenuSoccer;
let playbackMatchPageRugby;
let playbackMatchPageSoccer;

let images = [];

// Sport-specific ball images
let ballFootballHome, ballFootballAway;
let ballAFLHome, ballAFLAway;
let ballRugbyHome, ballRugbyAway;

// Pause images
let paused;
let rugbyPaused;
let aflPaused;

// Overlay for playback pause
let playbackPauseImg;

// Playback backgrounds for rugby and soccer
let playbackBgRugby, playbackBgSoccer;
let playbackBgMatch1Rugby, playbackBgMatch2Rugby, playbackBgMatch3Rugby, playbackBgMatch4Rugby;
let playbackBgMatch1Soccer, playbackBgMatch2Soccer, playbackBgMatch3Soccer, playbackBgMatch4Soccer;

// Dimensions
let appWidth = 1200;
let appHeight = 800;

let connectionLost = false;
let selectedMode = 'live';

const MILLI_SEC_DELAY = 100;
const START_LABEL = 'Start';
const LIST_LABEL = 'Stadium Selector:';

// State enumeration
const State = {
  PAUSED: 'PAUSED',
  ONGOING: 'ONGOING',
  FINISHED: 'FINISHED',
};

// Stadium names - Added "Oxford United" after "Port Vale"
const stadiums = [
  'Demonstration',
  'Marvel Stadium',
  'Port Vale',
  'Oxford United',
  'Aviva Stadium',
  'Aviva - Dublin',
];

// Stadium to MQTT topic mapping
const STADIUM_TOPICS = {
  'Demonstration': 'demo_IRL/sub',
  'Marvel Stadium': 'marvel_AUS/sub',
  'Port Vale': 'portvale_UK/sub',
  'Oxford United': 'oxford_UK/sub',
  'Aviva Stadium': 'aviva_IRL/sub',
  'Aviva - Dublin': 'avivaDublin_IRL/sub',
};

// Stadium to image index mapping
const STADIUM_IMAGES = {
  'Demonstration': 0,
  'Marvel Stadium': 1,
  'Port Vale': 0,
  'Oxford United': 0,
  'Aviva Stadium': 3,
  'Aviva - Dublin': 3,
};

// Possession constants
const POSSESSION_NEUTRAL = 66;
const POSSESSION_HOME = 1;
const POSSESSION_AWAY = 0;

let myFont; 
let backgroundImg;

function preload() {
  // Font
  myFont = loadFont('assets/arial.ttf');

  // Main menu background
  backgroundImg = loadImage('images/background.png');

  // Playback pause overlay
  playbackPauseImg = loadImage('images/playbackPause.png');

  // Pitches
  images[0] = loadImage('images/footballPitch.png');  // Soccer/Football
  images[1] = loadImage('images/aflPitch.png');       // AFL
  images[2] = loadImage('images/footballPitch.png');  // Another soccer if needed
  images[3] = loadImage('images/rugbyPitch.png');     // Rugby

  // Pause images
  paused = loadImage('images/footballPause.png');
  rugbyPaused = loadImage('images/rugbyPause.png');
  aflPaused = loadImage('images/aflPause.png');

  // Ball images
  ballFootballHome = loadImage('images/footballHome.png');
  ballFootballAway = loadImage('images/footballAway.png');
  ballAFLHome = loadImage('images/aflHome.png');
  ballAFLAway = loadImage('images/aflAway.png');
  ballRugbyHome = loadImage('images/rugbyHome.png');
  ballRugbyAway = loadImage('images/rugbyAway.png');

  // Rugby playback backgrounds
  playbackBgRugby = loadImage('images/playbackBackgroundRugby.png');
  playbackBgMatch1Rugby = loadImage('images/playbackBackgroundMatch1Rugby.png');
  playbackBgMatch2Rugby = loadImage('images/playbackBackgroundMatch2Rugby.png');
  playbackBgMatch3Rugby = loadImage('images/playbackBackgroundMatch3Rugby.png');
  playbackBgMatch4Rugby = loadImage('images/playbackBackgroundMatch4Rugby.png');

  // Soccer playback backgrounds
  playbackBgSoccer = loadImage('images/playbackBackgroundSoccer.png');
  playbackBgMatch1Soccer = loadImage('images/playbackBackgroundMatch1Soccer.png');
  playbackBgMatch2Soccer = loadImage('images/playbackBackgroundMatch2Soccer.png');
  playbackBgMatch3Soccer = loadImage('images/playbackBackgroundMatch3Soccer.png');
  playbackBgMatch4Soccer = loadImage('images/playbackBackgroundMatch4Soccer.png');
}

//////////////////////////////
// Base Page Class
//////////////////////////////

class Page {
  constructor() {
    this.controllers = [];
    this.background = null;
    this.font = null;
    this.visible = true;
  }

  show() {
    if (this.visible) return;
    this.visible = true;
    for (let p of pages) {
      if (p === this) continue;
      p.hide();
    }
    if (this.background) background(this.background);
    for (let c of this.controllers) c.show();
  }

  hide() {
    if (!this.visible) return;
    this.visible = false;
    for (let c of this.controllers) c.hide();
  }
}

function addPages(...pgs) {
  for (let p of pgs) {
    pages.push(p);
    p.hide();
  }
}

//////////////////////////////
// Game (Live Tracker)
//////////////////////////////

class Game extends Page {
  constructor() {
    super();
    this.state = State.PAUSED;
    this.time = millis();

    this.passKick = 0;
    this.tryScore = 0;
    this.conversion = 0;
    this.ruck = 0;
    this.scrumMaul = 0; // We'll set to 1 for a scrum.

    // if freeze = true, we skip sending updates.
    this.scrumFreeze = false;
    this.scrumStartTime = 0;
    this.scrumDuration = 6000;

    this.possession = POSSESSION_NEUTRAL;
    this.timestamp = 0;
    this.checkpoint = 0;
    this.selectedImage = -1;
    this.topic = null;
    this.stadium = null;
    this.pausedImg = paused;
    this.sendCounter = 0;
    this.sport = "";

    this.actionMessages = [];
    this.sentMessages = [];
  }

  addActionMessage(msg, duration) {
    this.actionMessages.push({ text: msg, expire: millis() + duration });
  }

  setStadium(url, stadium, selectedImageIndex) {
    this.stadium = stadium;
    this.selectedImage = selectedImageIndex;
    if (selectedImageIndex === 0 || selectedImageIndex === 2) {
      this.sport = "football";
      this.pausedImg = paused;
    } else if (selectedImageIndex === 1) {
      this.sport = "AFL";
      this.pausedImg = aflPaused;
    } else if (selectedImageIndex === 3) {
      this.sport = "rugby";
      this.pausedImg = rugbyPaused;
    }

    this.topic = STADIUM_TOPICS[this.stadium] || 'default/stadium/sub';
  }

  toJsonRequest() {
    if (!this.topic) {
      console.log("Can't send message without stadium");
      return "";
    }
    const constrainedX = constrain(mouseX, 0, appWidth);
    const constrainedY = constrain(mouseY, 0, appHeight);
    const scaleFactorX = 102 / appWidth;
    const scaleFactorY = 64 / appHeight;

    const scaledX = parseFloat((constrainedX * scaleFactorX).toFixed(2));
    const scaledY = parseFloat((constrainedY * scaleFactorY).toFixed(2));

    return {
      topic: this.topic,
      message: {
        T: parseFloat(this.timestamp.toFixed(2)),
        X: scaledX,
        Y: scaledY,
        P: this.possession,
        Pa: this.passKick,
        G: this.tryScore,
        C: this.conversion,
        R: this.ruck,
        S: this.scrumMaul,
      }
    };
  }

  show() {
    super.show();

    if (this.selectedImage < 0 || this.selectedImage >= images.length) {
      background(0);
      fill(255);
      textAlign(CENTER, CENTER);
      textSize(32);
      text('Please select a stadium from the main menu.', appWidth / 2, appHeight / 2);
      return;
    }

    image(images[this.selectedImage], 0, 0, 1200, 800);

    // Draw the ball based on possession.
    const imgSize = 65;
    let ballX = mouseX;
    let ballY = mouseY;

    if (this.possession === 1) {
      if (this.sport === "football") {
        image(ballFootballHome, ballX - imgSize / 2, ballY - imgSize / 2, imgSize, imgSize);
      } else if (this.sport === "AFL") {
        image(ballAFLHome, ballX - imgSize / 2, ballY - imgSize / 2, imgSize, imgSize);
      } else if (this.sport === "rugby") {
        image(ballRugbyHome, ballX - imgSize / 2, ballY - imgSize / 2, imgSize, imgSize);
      }
    } else {
      if (this.sport === "football") {
        image(ballFootballAway, ballX - imgSize / 2, ballY - imgSize / 2, imgSize, imgSize);
      } else if (this.sport === "AFL") {
        image(ballAFLAway, ballX - imgSize / 2, ballY - imgSize / 2, imgSize, imgSize);
      } else if (this.sport === "rugby") {
        image(ballRugbyAway, ballX - imgSize / 2, ballY - imgSize / 2, imgSize, imgSize);
      }
    }

    if (this.state === State.PAUSED) {
      imageMode(CORNER);
      image(this.pausedImg, 0, 0, 1200, 800);
    }

    // Ephemeral messages
    push();
    textSize(25);
    textStyle(BOLD);
    textAlign(CENTER, CENTER);
    fill('#004d61');
    let now = millis();
    this.actionMessages = this.actionMessages.filter(msgObj => now < msgObj.expire);
    if (this.actionMessages.length > 0) {
      let message = this.actionMessages[this.actionMessages.length - 1].text.toUpperCase();
      text(message, 0, 55, width, 32.9);
    }
    pop();

    // Only send messages if ongoing.
    const clock = millis();
    if (this.state === State.ONGOING && clock > this.time + MILLI_SEC_DELAY) {
      this.time = clock;

      // If we are in freeze => skip.
      if (this.scrumFreeze) {
        let elapsed = millis() - this.scrumStartTime;
        if (elapsed < this.scrumDuration) {
          return;
        } else {
          console.log("[SCRUM] 6s ended => scrum=0 => normal updates");
          this.scrumFreeze = false;
          this.scrumMaul = 0;
        }
      }

      // Normal update.
      this.timestamp = (clock / 1000.0) - this.checkpoint;
      let payload = this.toJsonRequest();
      if (!payload) return;
      
      console.log(`[Live] Sending update #${this.sendCounter++}`, payload);
      this.sentMessages.push(payload);
      
      fetch('/api/mqtt-publish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      })
        .then(response => response.json())
        .then(data => {
          if (data.success) {
            console.log('Message published successfully!');
          } else {
            console.error('Publish error:', data.error);
          }
        })
        .catch(err => console.error('Network error:', err));

      // Reset ephemeral fields
      this.passKick = 0;
      this.tryScore = 0;
      this.conversion = 0;
      this.ruck = 0;
      // scrumMaul remains if freeze hasn't ended
    }
  }

  onKeyPressed() {
    const k = key.toUpperCase();
    if (k === 'E') {
      if (selectedMode === 'live') {
        saveJSON({ data: this.sentMessages }, 'matchRecording.json');
        console.log('Saved match data to matchRecording.json');
      }
      return;
    }

    if (k === ' ') {
      // Toggle paused/ongoing
      this.state = (this.state === State.PAUSED) ? State.ONGOING : State.PAUSED;
      if (this.state === State.PAUSED) {
        this.checkpoint = this.timestamp;
      }
      return;
    }

    if (this.state !== State.ONGOING) return;

    switch (this.sport) {
      case "football":
        if (k === '1') {
          this.tryScore = 1;
          this.addActionMessage("Goal!", 4000);
        } else if (k === 'A') {
          this.passKick = 1;
          this.addActionMessage("Pass", 500);
        }
        break;
      case "AFL":
        if (k === '1') {
          this.tryScore = 1;
          this.addActionMessage("Goal", 4000);
        } else if (k === '2') {
          this.conversion = 1;
          this.addActionMessage("Behind", 2000);
        } else if (k === 'A') {
          this.passKick = 1;
          this.addActionMessage("Pass", 500);
        } else if (k === 'D') {
          this.ruck = 1;
          this.addActionMessage("Mark", 500);
        }
        break;
      case "rugby":
        if (k === '1') {
          this.tryScore = 1;
          this.addActionMessage("Try", 4000);
        } else if (k === '2') {
          this.conversion = 1;
          this.addActionMessage("Conversion", 2000);
        } else if (k === 'A') {
          this.passKick = 1;
          this.addActionMessage("Pass", 500);
        } else if (k === 'D') {
          this.ruck = 1;
          this.addActionMessage("Ruck", 500);
        } else if (k === 'F') {
          // scrum=1 immediately, then freeze 6s
          if (!this.scrumFreeze && this.scrumMaul === 0) {
            console.log("[SCRUM] Pressed => immediate scrum=1 => freeze 6s");
            this.scrumMaul = 1;

            // Send immediate update with scrum=1
            this.timestamp = (millis() / 1000.0) - this.checkpoint;
            let payload = this.toJsonRequest();
            if (payload) {
              console.log("[SCRUM] sending scrum=1 msg => now freeze");
              this.sentMessages.push(payload);
              
              fetch('/api/mqtt-publish', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
              })
                .then(response => response.json())
                .then(data => {
                  if (data.success) {
                    console.log('Message published successfully!');
                  } else {
                    console.error('Publish error:', data.error);
                  }
                })
                .catch(err => console.error('Network error:', err));
              this.addActionMessage("Scrum", 6000);
            }

            this.scrumFreeze = true;
            this.scrumStartTime = millis();
          }
        }
        break;
    }
  }

  handleMousePressed(event) {
    if (event.button === 0) {
      // Left click => switch possession
      this.possession = (this.possession === 1) ? 0 : 1;
    }
    if (event.button === 4) {
      // Mouse button 4 => pass
      this.passKick = 1;
      this.addActionMessage("Pass", 500);
    }
    // Right/middle click functionality removed.
  }

  start() {
    this.state = State.PAUSED;
  }

  finish() {
    this.state = State.FINISHED;
  }
}

//////////////////////////////
// Main Menu
//////////////////////////////

class MainPage extends Page {
  constructor() {
    super();
    this.font = myFont;
    this.background = backgroundImg;
    this.startButton = null;
    this.stadiumList = null;
    this.modeList = null;
    this.initGUI();
  }

  initGUI() {
    // Dropdown for modes
    this.modeList = createSelect();
    this.modeList.parent('ui-container');
    this.modeList.class('custom-dropdown');
    let modePlaceholder = createElement('option', 'Select Mode');
    modePlaceholder.attribute('disabled', '');
    modePlaceholder.parent(this.modeList);
    this.modeList.option('Live Tracker Mode', 'live');
    this.modeList.option('Rugby Playback Mode', 'rugbyPlayback');
    this.modeList.option('Soccer Playback Mode', 'soccerPlayback');
    this.modeList.changed(() => {
      selectedMode = this.modeList.value();
      if (selectedMode === 'live') {
        currentPage = mainMenu;
      } else if (selectedMode === 'rugbyPlayback') {
        currentPage = playbackMenuRugby;
      } else if (selectedMode === 'soccerPlayback') {
        currentPage = playbackMenuSoccer;
      }
      currentPage.show();
    });
    this.controllers.push(this.modeList);

    // Stadium selector
    this.stadiumList = createSelect();
    this.stadiumList.parent('ui-container');
    this.stadiumList.class('custom-dropdown');
    let placeholderOption = createElement('option', LIST_LABEL);
    placeholderOption.attribute('disabled', '');
    placeholderOption.parent(this.stadiumList);
    for (let i = 0; i < stadiums.length; i++) {
      this.stadiumList.option(stadiums[i], i);
    }
    this.stadiumList.changed(() => this.onClickList());
    this.controllers.push(this.stadiumList);

    // Default to first stadium
    this.stadiumList.value(0);
    this.onSelectStadium(0);

    // Start button
    this.startButton = createButton(START_LABEL);
    this.startButton.parent('ui-container');
    this.startButton.class('start-button');
    this.startButton.mousePressed(() => this.onClickStart());
    this.controllers.push(this.startButton);
  }

  onClickStart() {
    if (selectedMode === 'live') {
      game.start();
      currentPage = game;
    } else if (selectedMode === 'rugbyPlayback') {
      currentPage = playbackMenuRugby;
    } else if (selectedMode === 'soccerPlayback') {
      currentPage = playbackMenuSoccer;
    }
  }

  onClickList() {
    const selectedValue = this.stadiumList.value();
    if (selectedValue >= 0) this.onSelectStadium(parseInt(selectedValue));
  }

  onSelectStadium(selectedStadium) {
    const stadiumName = stadiums[selectedStadium];
    const imgIndex = STADIUM_IMAGES[stadiumName] || 0;

    if (game) {
      game.setStadium(null, stadiumName, imgIndex);
      console.log(`Selected stadium: ${stadiumName}, Image index: ${imgIndex}`);
    }
  }

  show() {
    super.show();
    if (this.background) background(this.background);
  }
}

//////////////////////////////
// PlaybackMenu for Rugby
//////////////////////////////

class PlaybackMenuRugby extends Page {
  constructor() {
    super();
    this.background = playbackBgRugby;
    this.zones = [
      {
        xFrac: 235/1200, yFrac: 219/800,
        wFrac: 286/1200, hFrac: 262/800,
        matchNum: 1,
        hoverBg: playbackBgMatch1Rugby
      },
      {
        xFrac: 673/1200, yFrac: 219/800,
        wFrac: 286/1200, hFrac: 262/800,
        matchNum: 2,
        hoverBg: playbackBgMatch2Rugby
      },
      {
        xFrac: 235/1200, yFrac: 510/800,
        wFrac: 286/1200, hFrac: 262/800,
        matchNum: 3,
        hoverBg: playbackBgMatch3Rugby
      },
      {
        xFrac: 673/1200, yFrac: 510/800,
        wFrac: 286/1200, hFrac: 262/800,
        matchNum: 4,
        hoverBg: playbackBgMatch4Rugby
      },
    ];
  }

  show() {
    super.show();
    
    let fx = mouseX / width;
    let fy = mouseY / height;
    let currentBg = this.background;
    let hoveringZone = false;

    for (let zone of this.zones) {
      if (
        fx >= zone.xFrac && fx <= zone.xFrac + zone.wFrac &&
        fy >= zone.yFrac && fy <= zone.yFrac + zone.hFrac
      ) {
        currentBg = zone.hoverBg;
        hoveringZone = true;
        break;
      }
    }

    image(currentBg, 0, 0, width, height);
    cursor(hoveringZone ? HAND : ARROW);
  }

  handleMousePressed(evt) {
    if (evt.button !== 0) return;
    let fx = mouseX / width;
    let fy = mouseY / height;
    for (let zone of this.zones) {
      if (
        fx >= zone.xFrac && fx <= zone.xFrac + zone.wFrac &&
        fy >= zone.yFrac && fy <= zone.yFrac + zone.hFrac
      ) {
        console.log(`Clicked Match ${zone.matchNum} zone (Rugby)!`);
        // Load match data and audio
        playbackMatchPageRugby.loadJSONFile(`data/match${zone.matchNum} rugby.json`);
        playbackMatchPageRugby.loadAudio(`data/match${zone.matchNum} rugby.mp3`);
        playbackMatchPageRugby.startInPause();
        currentPage = playbackMatchPageRugby;
        break;
      }
    }
  }
}

//////////////////////////////
// PlaybackMenu for Soccer
//////////////////////////////

class PlaybackMenuSoccer extends Page {
  constructor() {
    super();
    this.background = playbackBgSoccer;
    this.zones = [
      {
        xFrac: 235/1200, yFrac: 219/800,
        wFrac: 286/1200, hFrac: 262/800,
        matchNum: 1,
        hoverBg: playbackBgMatch1Soccer
      },
      {
        xFrac: 673/1200, yFrac: 219/800,
        wFrac: 286/1200, hFrac: 262/800,
        matchNum: 2,
        hoverBg: playbackBgMatch2Soccer
      },
      {
        xFrac: 235/1200, yFrac: 510/800,
        wFrac: 286/1200, hFrac: 262/800,
        matchNum: 3,
        hoverBg: playbackBgMatch3Soccer
      },
      {
        xFrac: 673/1200, yFrac: 510/800,
        wFrac: 286/1200, hFrac: 262/800,
        matchNum: 4,
        hoverBg: playbackBgMatch4Soccer
      },
    ];
  }

  show() {
    super.show();
    
    let fx = mouseX / width;
    let fy = mouseY / height;
    let currentBg = this.background;
    let hoveringZone = false;

    for (let zone of this.zones) {
      if (
        fx >= zone.xFrac && fx <= zone.xFrac + zone.wFrac &&
        fy >= zone.yFrac && fy <= zone.yFrac + zone.hFrac
      ) {
        currentBg = zone.hoverBg;
        hoveringZone = true;
        break;
      }
    }

    image(currentBg, 0, 0, width, height);
    cursor(hoveringZone ? HAND : ARROW);
  }

  handleMousePressed(evt) {
    if (evt.button !== 0) return;
    let fx = mouseX / width;
    let fy = mouseY / height;
    for (let zone of this.zones) {
      if (
        fx >= zone.xFrac && fx <= zone.xFrac + zone.wFrac &&
        fy >= zone.yFrac && fy <= zone.yFrac + zone.hFrac
      ) {
        console.log(`Clicked Match ${zone.matchNum} zone (Soccer)!`);
        // Load match data and audio
        playbackMatchPageSoccer.loadJSONFile(`data/match${zone.matchNum} soccer.json`);
        playbackMatchPageSoccer.loadAudio(`data/match${zone.matchNum} soccer.mp3`);
        playbackMatchPageSoccer.startInPause();
        currentPage = playbackMatchPageSoccer;
        break;
      }
    }
  }
}

//////////////////////////////
// PlaybackMatchPage (Rugby)
//////////////////////////////

class PlaybackMatchPageRugby extends Page {
  constructor() {
    super();
    this.selectedImageIndex = 3; // rugby pitch
    this.sport = 'rugby';
    this.playbackPauseImg = playbackPauseImg;

    this.jsonData = null;
    this.jsonArray = [];
    this.jsonSize = 0;

    // Playback timeline
    this.startPlaybackTime = 0;
    this.isPaused = true;
    this.pauseStartTime = 0;
    this.totalPausedDuration = 0;
    this.counter = 0;
    this.baseT = 0;
    this.hasStarted = false;

    this.actionMessages = [];
    this.ballX = 0;
    this.ballY = 0;
    this.possession = POSSESSION_NEUTRAL;

    this.audio = null;
  }

  setBallTo(msg) {
    let scaleX = appWidth / 102;
    let scaleY = appHeight / 64;
    this.ballX = msg.X * scaleX;
    this.ballY = msg.Y * scaleY;
    this.possession = msg.P;
  }

  homeBall() {
    if (this.jsonSize > 0 && this.jsonArray[0].message) {
      let firstMsg = this.jsonArray[0].message;
      this.setBallTo(firstMsg);
      let homeMsg = {
        topic: 'aviva_IRL/sub',
        message: {
          T: firstMsg.T,
          X: firstMsg.X,
          Y: firstMsg.Y,
          P: firstMsg.P,
          Pa: firstMsg.Pa,
          G: firstMsg.G,
          C: firstMsg.C,
          R: firstMsg.R,
          S: firstMsg.S
        }
      };
      
      fetch('/api/mqtt-publish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(homeMsg)
      })
        .then(response => response.json())
        .then(data => {
          if (data.success) {
            console.log('Message published successfully!');
          } else {
            console.error('Publish error:', data.error);
          }
        })
        .catch(err => console.error('Network error:', err));
      console.log('Homing message sent:', homeMsg);
    }
  }

  loadJSONFile(filepath) {
    loadJSON(filepath, (data) => {
      this.jsonData = data;
      if (!data || !data.data) {
        this.jsonArray = [];
        this.jsonSize = 0;
        this.baseT = 0;
      } else {
        this.jsonArray = data.data;
        this.jsonSize = this.jsonArray.length;
        if (this.jsonSize > 0 && this.jsonArray[0].message) {
          this.baseT = this.jsonArray[0].message.T;
          if (this.isPaused) {
            this.homeBall();
          }
        } else {
          this.baseT = 0;
        }
      }
      console.log(`Loaded ${filepath}, entries: ${this.jsonSize}`);
    });
  }

  loadAudio(audioPath) {
    if (this.audio) {
      this.audio.stop();
      this.audio = null;
    }
    this.audio = loadSound(
      audioPath,
      () => {
        console.log('Audio loaded:', audioPath);
        this.audio.stop();
      },
      (err) => {
        console.error('Audio failed to load:', err);
      }
    );
  }

  startInPause() {
    this.isPaused = true;
    this.hasStarted = false;
    this.counter = 0;
    this.totalPausedDuration = 0;
    this.startPlaybackTime = millis();
  }

  addActionMessage(msg, duration) {
    this.actionMessages.push({ text: msg, expire: millis() + duration });
  }

  show() {
    super.show();

    // Rugby pitch
    image(images[this.selectedImageIndex], 0, 0, 1200, 800);

    const imgSize = 65;
    if (this.possession === 1) {
      image(ballRugbyHome, this.ballX - imgSize / 2, this.ballY - imgSize / 2, imgSize, imgSize);
    } else {
      image(ballRugbyAway, this.ballX - imgSize / 2, this.ballY - imgSize / 2, imgSize, imgSize);
    }

    if (this.isPaused) {
      imageMode(CORNER);
      image(this.playbackPauseImg, 0, 0, 1200, 800);
    }

    // Ephemeral messages
    push();
    textSize(25);
    textStyle(BOLD);
    textAlign(CENTER, CENTER);
    fill('#004d61');
    let now = millis();
    this.actionMessages = this.actionMessages.filter(msgObj => now < msgObj.expire);
    if (this.actionMessages.length > 0) {
      let message = this.actionMessages[this.actionMessages.length - 1].text.toUpperCase();
      text(message, 0, 55, width, 32.9);
    }
    pop();

    // Playback timeline
    if (!this.isPaused && this.jsonArray && this.counter < this.jsonSize) {
      let currentTime = millis();
      let entry = this.jsonArray[this.counter];
      if (!entry || !entry.message) return;

      let scheduledTime = this.startPlaybackTime + (entry.message.T - this.baseT)*1000 + this.totalPausedDuration;
      if (currentTime >= scheduledTime) {
        console.log(`Sending playback update #${this.counter}`);
        this.processEntry(entry.message);
        this.counter++;
      }
    }
  }

  processEntry(msg) {
    this.setBallTo(msg);

    if (msg.Pa === 1) {
      this.addActionMessage("Pass", 500);
    }
    if (msg.G === 1) {
      this.addActionMessage("Try", 4000);
    }
    if (msg.C === 1) {
      this.addActionMessage("Conversion", 2000);
    }
    if (msg.R === 1) {
      this.addActionMessage("Ruck", 500);
    }
    if (msg.S === 1) {
      this.addActionMessage("Scrum", 1000);
    }

    let playbackMsg = {
      topic: 'aviva_IRL/sub',
      message: {
        T: msg.T,
        X: msg.X,
        Y: msg.Y,
        P: msg.P,
        Pa: msg.Pa,
        G: msg.G,
        C: msg.C,
        R: msg.R,
        S: msg.S
      }
    };
    
    fetch('/api/mqtt-publish', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(playbackMsg)
    })
      .then(response => response.json())
      .then(data => {
        if (data.success) {
          console.log('Message published successfully!');
        } else {
          console.error('Publish error:', data.error);
        }
      })
      .catch(err => console.error('Network error:', err));
    console.log('Playback (Rugby) => Dalymount:', playbackMsg);
  }

  onKeyPressed() {
    // ESC => return to Rugby playback menu
    if (keyCode === ESCAPE) {
      console.log("Returning to playback menu (Rugby)");
      if (this.audio) {
        this.audio.stop();
      }
      this.isPaused = true;
      this.hasStarted = false;
      currentPage = playbackMenuRugby;
      return;
    }

    // R => restart
    if (key === 'r' || key === 'R') {
      console.log("Restarting playback from beginning (Rugby)");
      this.counter = 0;
      this.totalPausedDuration = 0;
      this.startPlaybackTime = millis();
      this.isPaused = true;
      this.hasStarted = false;
      if (this.audio) {
        this.audio.stop();
      }
      console.log("Playback reset (Rugby)");
      return;
    }

    // Space => pause/resume
    if (key === ' ') {
      if (this.isPaused) {
        if (!this.hasStarted) {
          this.hasStarted = true;
          this.counter = 0;
          this.totalPausedDuration = 0;
          this.startPlaybackTime = millis();
          console.log("Playback started from t=0 (Rugby)");
          if (this.audio) {
            this.audio.stop();
            this.audio.play(0);
          }
        } else {
          let pausedInterval = millis() - this.pauseStartTime;
          this.totalPausedDuration += pausedInterval;
          console.log("Playback resumed (Rugby)");
          if (this.audio) {
            this.audio.play();
          }
        }
        this.isPaused = false;
      } else {
        console.log("Playback paused (Rugby)");
        this.pauseStartTime = millis();
        if (this.audio) {
          this.audio.pause();
        }
        this.isPaused = true;
      }
    }
  }
}

//////////////////////////////
// PlaybackMatchPage (Soccer)
//////////////////////////////

class PlaybackMatchPageSoccer extends Page {
  constructor() {
    super();
    this.selectedImageIndex = 0; // using "football pitch.png" for soccer
    this.sport = 'football';
    this.playbackPauseImg = playbackPauseImg;

    this.jsonData = null;
    this.jsonArray = [];
    this.jsonSize = 0;

    // Playback timeline
    this.startPlaybackTime = 0;
    this.isPaused = true;
    this.pauseStartTime = 0;
    this.totalPausedDuration = 0;
    this.counter = 0;
    this.baseT = 0;
    this.hasStarted = false;

    this.actionMessages = [];
    this.ballX = 0;
    this.ballY = 0;
    this.possession = POSSESSION_NEUTRAL;

    this.audio = null;
  }

  setBallTo(msg) {
    let scaleX = appWidth / 102;
    let scaleY = appHeight / 64;
    this.ballX = msg.X * scaleX;
    this.ballY = msg.Y * scaleY;
    this.possession = msg.P;
  }

  homeBall() {
    if (this.jsonSize > 0 && this.jsonArray[0].message) {
      let firstMsg = this.jsonArray[0].message;
      this.setBallTo(firstMsg);
      let homeMsg = {
        topic: 'aviva_IRL/sub',
        message: {
          T: firstMsg.T,
          X: firstMsg.X,
          Y: firstMsg.Y,
          P: firstMsg.P,
          Pa: firstMsg.Pa,
          G: firstMsg.G,
          C: firstMsg.C,
          R: firstMsg.R,
          S: firstMsg.S
        }
      };
      
      fetch('/api/mqtt-publish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(homeMsg)
      })
        .then(response => response.json())
        .then(data => {
          if (data.success) {
            console.log('Message published successfully!');
          } else {
            console.error('Publish error:', data.error);
          }
        })
        .catch(err => console.error('Network error:', err));
      console.log('Homing message sent:', homeMsg);
    }
  }

  loadJSONFile(filepath) {
    loadJSON(filepath, (data) => {
      this.jsonData = data;
      if (!data || !data.data) {
        this.jsonArray = [];
        this.jsonSize = 0;
        this.baseT = 0;
      } else {
        this.jsonArray = data.data;
        this.jsonSize = this.jsonArray.length;
        if (this.jsonSize > 0 && this.jsonArray[0].message) {
          this.baseT = this.jsonArray[0].message.T;
          if (this.isPaused) {
            this.homeBall();
          }
        } else {
          this.baseT = 0;
        }
      }
      console.log(`Loaded ${filepath}, entries: ${this.jsonSize}`);
    });
  }

  loadAudio(audioPath) {
    if (this.audio) {
      this.audio.stop();
      this.audio = null;
    }
    this.audio = loadSound(
      audioPath,
      () => {
        console.log('Audio loaded:', audioPath);
        this.audio.stop();
      },
      (err) => {
        console.error('Audio failed to load:', err);
      }
    );
  }

  startInPause() {
    this.isPaused = true;
    this.hasStarted = false;
    this.counter = 0;
    this.totalPausedDuration = 0;
    this.startPlaybackTime = millis();
  }

  addActionMessage(msg, duration) {
    this.actionMessages.push({ text: msg, expire: millis() + duration });
  }

  show() {
    super.show();

    // Football pitch for soccer
    image(images[this.selectedImageIndex], 0, 0, 1200, 800);

    const imgSize = 65;
    if (this.possession === 1) {
      image(ballFootballHome, this.ballX - imgSize / 2, this.ballY - imgSize / 2, imgSize, imgSize);
    } else {
      image(ballFootballAway, this.ballX - imgSize / 2, this.ballY - imgSize / 2, imgSize, imgSize);
    }

    if (this.isPaused) {
      imageMode(CORNER);
      image(this.playbackPauseImg, 0, 0, 1200, 800);
    }

    // Ephemeral messages
    push();
    textSize(25);
    textStyle(BOLD);
    textAlign(CENTER, CENTER);
    fill('#004d61');
    let now = millis();
    this.actionMessages = this.actionMessages.filter(msgObj => now < msgObj.expire);
    if (this.actionMessages.length > 0) {
      let message = this.actionMessages[this.actionMessages.length - 1].text.toUpperCase();
      text(message, 0, 55, width, 32.9);
    }
    pop();

    // Playback timeline
    if (!this.isPaused && this.jsonArray && this.counter < this.jsonSize) {
      let currentTime = millis();
      let entry = this.jsonArray[this.counter];
      if (!entry || !entry.message) return;

      let scheduledTime = this.startPlaybackTime + (entry.message.T - this.baseT)*1000 + this.totalPausedDuration;
      if (currentTime >= scheduledTime) {
        console.log(`Sending playback update #${this.counter}`);
        this.processEntry(entry.message);
        this.counter++;
      }
    }
  }

  processEntry(msg) {
    this.setBallTo(msg);

    if (msg.Pa === 1) {
      this.addActionMessage("Pass", 500);
    }
    if (msg.G === 1) {
      this.addActionMessage("Goal!", 4000);
    }
    if (msg.C === 1) {
      this.addActionMessage("Conversion", 2000);
    }
    if (msg.R === 1) {
      this.addActionMessage("Ruck", 500);
    }
    if (msg.S === 1) {
      this.addActionMessage("Scrum", 1000);
    }

    // TODO: This surely shouldn't be hardcoded, artefact from David
    let playbackMsg = {
      topic: 'aviva_IRL/sub',
      message: {
        T: msg.T,
        X: msg.X,
        Y: msg.Y,
        P: msg.P,
        Pa: msg.Pa,
        G: msg.G,
        C: msg.C,
        R: msg.R,
        S: msg.S
      }
    };
    
    fetch('/api/mqtt-publish', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(playbackMsg)
    })
      .then(response => response.json())
      .then(data => {
        if (data.success) {
          console.log('Message published successfully!');
        } else {
          console.error('Publish error:', data.error);
        }
      })
      .catch(err => console.error('Network error:', err));
    console.log('Playback (Soccer) => Dalymount:', playbackMsg);
  }

  onKeyPressed() {
    // ESC => return to Soccer playback menu
    if (keyCode === ESCAPE) {
      console.log("Returning to playback menu (Soccer)");
      if (this.audio) {
        this.audio.stop();
      }
      this.isPaused = true;
      this.hasStarted = false;
      currentPage = playbackMenuSoccer;
      return;
    }

    // R => restart
    if (key === 'r' || key === 'R') {
      console.log("Restarting playback from beginning (Soccer)");
      this.counter = 0;
      this.totalPausedDuration = 0;
      this.startPlaybackTime = millis();
      this.isPaused = true;
      this.hasStarted = false;
      if (this.audio) {
        this.audio.stop();
      }
      console.log("Playback reset (Soccer)");
      return;
    }

    // Space => pause/resume
    if (key === ' ') {
      if (this.isPaused) {
        if (!this.hasStarted) {
          this.hasStarted = true;
          this.counter = 0;
          this.totalPausedDuration = 0;
          this.startPlaybackTime = millis();
          console.log("Playback started from t=0 (Soccer)");
          if (this.audio) {
            this.audio.stop();
            this.audio.play(0);
          }
        } else {
          let pausedInterval = millis() - this.pauseStartTime;
          this.totalPausedDuration += pausedInterval;
          console.log("Playback resumed (Soccer)");
          if (this.audio) {
            this.audio.play();
          }
        }
        this.isPaused = false;
      } else {
        console.log("Playback paused (Soccer)");
        this.pauseStartTime = millis();
        if (this.audio) {
          this.audio.pause();
        }
        this.isPaused = true;
      }
    }
  }
}

//////////////////////////////
// WebSocket + Connection
//////////////////////////////

let requests = [];
let socket = null;

function checkInternetConnectionThread() {
  let wasConnected = navigator.onLine;
  setInterval(() => {
    const isConnected = navigator.onLine;
    if (wasConnected !== isConnected) {
      connectionLost = !isConnected;
      wasConnected = isConnected;
    }
  }, 5000);
}

function webSetup() {
  checkInternetConnectionThread();
  window.addEventListener('online', () => connectionLost = false);
  window.addEventListener('offline', () => connectionLost = true);
}

function setup() {
  const cnv = createCanvas(appWidth, appHeight);
  cnv.parent('canvas-container');
  cnv.elt.getContext('2d', { willReadFrequently: true });

  game = new Game();
  mainMenu = new MainPage();
  playbackMenuRugby = new PlaybackMenuRugby();
  playbackMenuSoccer = new PlaybackMenuSoccer();
  playbackMatchPageRugby = new PlaybackMatchPageRugby();
  playbackMatchPageSoccer = new PlaybackMatchPageSoccer();

  addPages(
    game, 
    mainMenu, 
    playbackMenuRugby, 
    playbackMenuSoccer, 
    playbackMatchPageRugby, 
    playbackMatchPageSoccer
  );
  currentPage = mainMenu;
  currentPage.show();

  frameRate(60);
  // webSetup();
}

function draw() {
  if (currentPage?.show) currentPage.show();
  if (connectionLost) displayConnectionWarning();
}

function displayConnectionWarning() {
  fill(255, 0, 0);
  textSize(32);
  textAlign(CENTER, CENTER);
  text('Connection lost!', width / 2, height / 2);
}

function keyPressed() {
  if (currentPage?.onKeyPressed) {
    currentPage.onKeyPressed();
  }
}

function mousePressed(event) {
  if (currentPage?.handleMousePressed) {
    currentPage.handleMousePressed(event);
  }
  // Prevent context menu on right/middle click
  if (event.button === 4 || event.button === 2 || event.button === 3) {
    event.preventDefault();
  }
}

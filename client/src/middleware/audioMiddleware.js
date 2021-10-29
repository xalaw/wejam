import * as actions from '../components/audio-wrapper/actions'
import * as micActions from '../components/mic/actions'

export const audioMiddleware = store => {
  let audioContext
  let currentSubdivision = 1;
  let tickLength;
  let secondsPerBeat;
  let timeSignature;
  let oscillators = {};
  let recording = [];
  let recordingInterval = 2;
  let recordingStartTime;
  let roommates;
  let interval;
  let nextTickTime;
  let isRecording = false;

  //helper functions
  function playMetronomeTone(time, velocity, note) {
    let osc = audioContext.createOscillator();
    let amp = audioContext.createGain();
    osc.connect(amp);
    amp.connect(audioContext.destination);

    amp.gain.value = velocity;
    osc.frequency.value = note;

    osc.start(time);
    osc.stop(time + 0.1);
  }

  //used to play notes both with and without pre-defined stopping times
  function playNote(instrument, detune, start, stop) {
    switch (instrument) {
      case "keyboard":
        playKeyboard(detune, start, stop);
        break;
      default:
        playSamples(instrument, detune, start, stop);
        break;
    }
  }

  function playKeyboard(detune, start, stop) {
    let osc = audioContext.createOscillator();
    let amp = audioContext.createGain();
    osc.connect(amp);
    amp.connect(audioContext.destination);

    osc.type = 'sine';

    amp.gain.value = 0.2;
    osc.frequency.value = 440;
    osc.detune.value = detune;
    start ?
      osc.start(start) :
      osc.start(audioContext.currentTime)
    if (stop) {
      osc.stop(stop);
    }
    else {
      // let pushItem = { oscillator: osc, detune }
      // oscillators.push(pushItem)
      oscillators[detune] = osc;
    }
  }

  function playSamples(instrument, detune, start, stop) {
    getSample(`samples/${instrument}/${detune}`, function play(buffer) {
      let player = audioContext.createBufferSource()
      player.buffer = buffer
      let amp = audioContext.createGain();
      amp.gain.value = 0.15;
      player.connect(amp);
      amp.connect(audioContext.destination)
      start ?
        player.start(start) :
        player.start(audioContext.currentTime);
      if (stop) {
        player.stop(stop);
      }
      else {
        // let pushItem = { oscillator: player, detune }
        // oscillators.push(pushItem)
        oscillators[detune] = player;
      }
    })
  }

  function getSample(url, cb) {
    var request = new XMLHttpRequest()
    request.open('GET', url)
    request.responseType = 'arraybuffer'
    request.onload = function () {
      audioContext.decodeAudioData(request.response, cb)
    }
    request.send()
  }

  function stopNote(instrument, detune) {
    if (oscillators[detune]) {
      oscillators[detune].stop(0);
      delete oscillators[detune]
    }
  }

  function recordNote(instrument, detune) {
    //check to make sure starttime doesn't go over permitted length
    if (audioContext.currentTime - recordingStartTime < (recordingInterval * secondsPerBeat * timeSignature)) {
      recording.push({ instrument, startTime: audioContext.currentTime - recordingStartTime, detune, stopTime: undefined });
    }
  }

  function stopRecordingNote(instrument, detune) {
    for (let i = 0; i < recording.length; i++) {
      if (recording[i].detune === detune) {
        if (!recording[i].stopTime) {
          recording[i].stopTime = audioContext.currentTime - recordingStartTime;
          break;
        }
      }
    }
  }

  return next => action => {
    if (action.type === actions.SET_IS_PLAYING && !audioContext) {
      audioContext = new AudioContext();
      currentSubdivision = 1;
      timeSignature = action.timeSignature;
      secondsPerBeat = 60 / action.bpm;
      tickLength = 1 / action.timeSignature * 60 / action.bpm;
      interval = setInterval(() => store.dispatch({ type: actions.SET_NEXT_TICK_TIME, bpm: action.bpm, timeSignature: action.timeSignature }), tickLength * 1000);
    }
    else if (action.type === actions.SET_NOT_PLAYING && audioContext) {
      clearInterval(interval);
      interval = undefined;
      audioContext.close().then(function () {
        audioContext = undefined;
      });
    }
    else if (action.type === actions.SET_NEXT_TICK_TIME) {
      nextTickTime = audioContext.currentTime + tickLength;
      if (currentSubdivision === timeSignature * recordingInterval * 4) {
        currentSubdivision = 1;
      }
      else {
        currentSubdivision++;
        //subdivision 2 is treated as the "first" beat of the measure
        if (currentSubdivision === 2) {
          //plays the current recording if it's not sent to room
          recording.forEach((note) => playNote(note.instrument, note.detune, note.startTime + nextTickTime, note.stopTime + nextTickTime));
          let currentUser = store.getState().socketWrapper.socketID;
          //plays all other sent recordings, except user's sent recording if user is recording or has an unsent recording
          Object.keys(roommates).forEach((user) => {
            if (user === currentUser && (isRecording || recording.length > 0)) {
              return;
            }
            if (!store.getState().audioWrapper.muted[user]) {
              let roommateRecording = roommates[user].recording;
              if (roommateRecording) {
                roommateRecording.forEach((note) => playNote(note.instrument, note.detune, note.startTime + nextTickTime, note.stopTime + nextTickTime))
              }
            }
          })
        }
        if (currentSubdivision === 2 || currentSubdivision === (2 + (4 * timeSignature))) {
          playMetronomeTone(nextTickTime, .2, 408);
          store.dispatch({ type: actions.METRONOME_ON })
          setTimeout(() => store.dispatch({ type: actions.METRONOME_OFF }), 100)
        }
        else if (currentSubdivision % action.timeSignature === 2) {
          playMetronomeTone(nextTickTime, .04, 208);
          store.dispatch({ type: actions.METRONOME_ON })
          setTimeout(() => store.dispatch({ type: actions.METRONOME_OFF }), 100)
        }
      }
      action.currentSubdivision = currentSubdivision
    }
    else if (action.type === actions.START_PLAYING) {
      playNote(action.instrument, action.detune)
    }
    else if (action.type === actions.STOP_PLAYING) {
      stopNote(action.instrument, action.detune)
    }
    else if (action.type === actions.RECORD_NOTE) {
      recordNote(action.instrument, action.detune)
    }
    else if (action.type === actions.STOP_RECORDING_NOTE) {
      stopRecordingNote(action.instrument, action.detune)
    }
    else if (action.type === actions.START_RECORDING) {
      store.dispatch({ type: actions.TRASH_RECORDING });
      let timeUntilRecordingStop = recordingInterval * secondsPerBeat * timeSignature * 1000
      recordingStartTime = audioContext.currentTime;
      if (store.getState().audioWrapper.instrument === "mic") {
        store.dispatch({ type: micActions.START_MIC_RECORDING })
        setTimeout(() => store.dispatch({ type: micActions.STOP_MIC_RECORDING }), timeUntilRecordingStop)
      }
      setTimeout(() => store.dispatch({ type: actions.UPDATE_RECORDING_MESSAGE, recordingMessage: 'Stopping recording in 3...' }), timeUntilRecordingStop - 3000);
      setTimeout(() => store.dispatch({ type: actions.UPDATE_RECORDING_MESSAGE, recordingMessage: 'Stopping recording in 2...' }), timeUntilRecordingStop - 2000);
      setTimeout(() => store.dispatch({ type: actions.UPDATE_RECORDING_MESSAGE, recordingMessage: 'Stopping recording in 1...' }), timeUntilRecordingStop - 1000);
      setTimeout(() => isRecording = false, timeUntilRecordingStop - 25);
      setTimeout(() => {
        Object.keys(oscillators).forEach(oscillator => {
          oscillators[oscillator].stop(0)
        })
      }, timeUntilRecordingStop - 25)
      setTimeout(() => {
        recording.forEach(note => {
          if (!note.stopTime || note.stopTime > (audioContext.currentTime - recordingStartTime)) {
            note.stopTime = (audioContext.currentTime - recordingStartTime)
          }
        })
      }, timeUntilRecordingStop - 25);
      setTimeout(() => store.dispatch({ type: actions.STOP_RECORDING }), timeUntilRecordingStop)
    }
    else if (action.type === actions.STOP_RECORDING) {
      if (store.getState().audioWrapper.instrument !== "mic") {
        store.dispatch({ type: actions.ENABLE_SEND_RECORDING, enableSendRecording: true })
        // recording.forEach(note => {
        //   if (!note.stopTime || note.stopTime > (audioContext.currentTime - recordingStartTime)) {
        //     note.stopTime = (audioContext.currentTime - recordingStartTime)
        //   }
        // })
      }
      else {
        recording = [{ instrument: "mic", startTime: 0, detune: `${store.getState().socketWrapper.room}_${store.getState().socketWrapper.displayName}.ogg`, stopTime: (audioContext.currentTime - recordingStartTime) }]
      }
      store.dispatch({ type: actions.UPDATE_RECORDING_MESSAGE, recordingMessage: "To Record, Press " })
    }
    else if (action.type === actions.RECEIVE_RECORDING) {
      //POTENTIALLY REFACTOR TO REMOVE RECORDINGS FROM LIST OF ROOMMATES
      roommates = action.roommates;
    }
    else if (action.type === actions.SEND_RECORDING) {
      if (recording.length > 0) {
        action.recording = [...recording];
        store.dispatch({ type: actions.TRASH_RECORDING });
      }
      store.dispatch({ type: actions.ENABLE_SEND_RECORDING, enableSendRecording: false })
    }
    else if (action.type === actions.REQUEST_START_RECORDING) {
      let totalSubdivisions = 4 * timeSignature * recordingInterval;
      //wherever 1 is below, that is used instead of 2 because we don't count the next tick - function may be called mid-tick
      let ticksUntilNextLoop = currentSubdivision < 2 ?
        (1 - currentSubdivision) :
        (totalSubdivisions + 1 - currentSubdivision);
      let timeUntilNextLoop = ticksUntilNextLoop * tickLength + nextTickTime - audioContext.currentTime;
      let timeUntilRecordInMS = (timeUntilNextLoop > 3) ?
        timeUntilNextLoop * 1000 :
        (timeUntilNextLoop + (totalSubdivisions * tickLength)) * 1000;
      store.dispatch({ type: actions.UPDATE_RECORDING_MESSAGE, recordingMessage: "You're set to record once we get to the start of the loop..." });
      setTimeout(() => store.dispatch({ type: actions.UPDATE_RECORDING_MESSAGE, recordingMessage: 'Recording in 3...' }), timeUntilRecordInMS - 3000);
      setTimeout(() => store.dispatch({ type: actions.UPDATE_RECORDING_MESSAGE, recordingMessage: 'Recording in 2...' }), timeUntilRecordInMS - 2000);
      setTimeout(() => store.dispatch({ type: actions.UPDATE_RECORDING_MESSAGE, recordingMessage: 'Recording in 1...' }), timeUntilRecordInMS - 1000);
      setTimeout(() => isRecording = true, timeUntilRecordInMS - 25);
      setTimeout(() => store.dispatch({ type: actions.UPDATE_RECORDING_MESSAGE, recordingMessage: "You're recording!" }), timeUntilRecordInMS);
      setTimeout(() => store.dispatch({ type: actions.START_RECORDING }), timeUntilRecordInMS);
    }
    else if (action.type === actions.TRASH_RECORDING) {
      store.dispatch({ type: actions.ENABLE_SEND_RECORDING, enableSendRecording: false });
      recording = [];
    }
    return next(action);
  }

}
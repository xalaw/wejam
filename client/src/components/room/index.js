import React from 'react';
import { connect } from 'react-redux';
import { } from './actions';
import Metronome from '../metronome';
import './index.css';

class Room extends React.Component {
  render() {
    return (
      <div>You are in room {this.props.room}
        <button onClick={() => this.props.leaveRoom()}>click to Brexit</button>
        <Metronome />
      </div>
    )
  }
}

const mapStateToProps = (state) => ({
  room: state.socketWrapper.room,
})

export default connect(mapStateToProps)(Room);


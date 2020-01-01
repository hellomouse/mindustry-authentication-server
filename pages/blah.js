import React from 'react';
import styles from './blah.module.scss';

// testing css modules, delete when done
export default function Blah() {
  return <div>
    <span className={styles.things}>Hi!</span>
    other things here...
  </div>;
}

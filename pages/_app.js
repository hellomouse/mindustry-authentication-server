import React from 'react';
import App from 'next/app';
// import global styles
// this is pretty much the entire purpose of this file right now
import './index.scss';

export default class OverriddenApp extends App {
  render() {
    const { Component, pageProps } = this.props;
    return <Component {...pageProps} />;
  }
}

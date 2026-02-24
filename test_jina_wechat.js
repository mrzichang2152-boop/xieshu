

// const fetch = require('node-fetch');


const url = 'https://mp.weixin.qq.com/s?src=11&timestamp=1768982936&ver=6493&signature=x5*2eWMAwAW6hdMZde8XRsMkybvCwEb1ep5lL9BDH0sXtAQOQYEmNabJH6kAI7s6LNKou9lI3R2wI0pIVz33CjZvDjQXcG2e9PMsdFX8lt*6**odGVdrEt9NF6R7vf5w&new=1';

async function test() {
  console.log('Testing Jina with URL:', url);
  try {
    const response = await fetch(`https://r.jina.ai/${url}`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'X-Return-Format': 'text'
      }
    });
    
    console.log('Status:', response.status);
    const text = await response.text();
    console.log('Length:', text.length);
    console.log('Content Start:', text.substring(0, 200));
  } catch (e) {
    console.error('Error:', e);
  }
}

test();

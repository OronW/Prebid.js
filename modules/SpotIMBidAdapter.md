# Overview

Module Name: SpotIM Bidder Adapter

Module Type: Bidder Adapter

Maintainer:


# Description

To use this adapter and for additional information, please contact: 


This adapter requires setup and approval before being used. 

The adapter supports the following media types: 
##### Banner 
##### Video(instream) 


# Bid Parameters

## Video

| Name          | Scope | Type | Description                                                    | Example
|---------------| ----- | ---- |----------------------------------------------------------------| -------
| `org` | required | String |  The org ID, as provided by your representative         | "YOUR-ORG-ID"
| `floorPrice`  | optional | Number | The minimum price in USD. ATTENTION: misuse of this parameter can impact revenue | 1.50
| `placementId` | optional | String | A unique placement identifier                                     | "112233"
| `testMode`    | optional | Boolean | Parameter to activate test mode                                      | false

# Test Parameters

```javascript
var adUnits = [{
  code: 'banner-div',
  mediaTypes: {
    banner: {
      sizes: [
        [160, 600],
        [120, 600]
      ]
    }
  },
  bids: [{
    bidder: 'spotIM',
    params: {
      org: 'YOUR-ORG-ID', // Required
      floorPrice: 1.3, // Optional
      placementId: '112233', // Optional
      testMode: true // Optional
    }
  }]
},
  {
    code: 'dfp-video-div',
    sizes: [
      [640, 480]
    ],
    mediaTypes: {
      video: {
        playerSize: [
          [640, 480]
        ],
        context: 'instream'
      }
    },
    bids: [{
      bidder: 'spotIM',
      params: {
        org: 'YOUR-ORG-ID', // Required
        floorPrice: 2.5, // Optional
        placementId: '112233', // Optional
        testMode: true // Optional
      }
    }]
  }
];
```

import { logWarn, logInfo, isArray, isFn, deepAccess, isEmpty, contains, timestamp, getBidIdParameter, triggerPixel, isInteger } from '../src/utils.js';
import {registerBidder} from '../src/adapters/bidderFactory.js';
import {BANNER, VIDEO} from '../src/mediaTypes.js';
import {config} from '../src/config.js';

const BIDDER_CODE = 'spotIM';
const DEFAULT_CURRENCY = 'USD';
const ADAPTER_VERSION = '1.0.0';
const TTL = 400;
const SUPPORTED_TYPES = [BANNER, VIDEO];
const SELLER_ENDPOINT = 'https://hb.spotimmedia.com/';
const MODES = {
  PRODUCTION: 'hb-multi-si',
  TEST: 'hb-multi-si-test'
}
const SUPPORTED_SYNC_METHODS = {
  IFRAME: 'iframe',
  PIXEL: 'pixel'
}

export const spec = {
  code: BIDDER_CODE,
  version: ADAPTER_VERSION,
  gvlid: 280,
  supportedMediaTypes: SUPPORTED_TYPES,
  isBidRequestValid: function (bidRequest) {
    let bidRequestValid = true;
    if (!bidRequest?.params?.org) {
      let warnType = bidRequest.params
        ? '** SpotIM adapter warnning - The org param is mandatory **'
        : '** SpotIM adapter warnning - Verify params property **'

      logWarn(warnType);
      bidRequestValid = false;
    }
    return bidRequestValid;
  },
  buildRequests: function (validBidRequests, bidderRequest) {
    const sharedParamsObject = validBidRequests[0];
    const testMode = sharedParamsObject.params.testMode;

    const bidsObject = createBidsObject(sharedParamsObject, bidderRequest, validBidRequests);

    return {
      method: 'POST',
      url: getSellerEndpoint(testMode),
      data: bidsObject
    }
  },
  interpretResponse: function ({body}) {
    let bidResponses = []

    if (body?.bids?.length) {
      bidResponses = parseResponses(body.bids)
    }

    return bidResponses;
  },
  getUserSyncs: function (syncOptions, serverResponses) {
    const syncs = [];
    for (const response of serverResponses) {
      if (syncOptions.iframeEnabled && response.body.params.userSyncURL) {
        syncs.push({
          type: 'iframe',
          url: response.body.params.userSyncURL
        });
      }
      if (syncOptions.pixelEnabled && isArray(response.body.params.userSyncPixels)) {
        const pixels = response.body.params.userSyncPixels.map(pixel => {
          return {
            type: 'image',
            url: pixel
          }
        })
        syncs.push(...pixels)
      }
    }
    return syncs;
  },
  onBidWon: function (bid) {
    if (bid == null) {
      return;
    }

    logInfo('onBidWon:', bid);
    if (bid.hasOwnProperty('nurl') && bid.nurl.length > 0) {
      triggerPixel(bid.nurl);
    }
  }
};

registerBidder(spec);

/**
 * Get bid floor price
 * @param {bid} bid
 * @param {string} mediaType
 * @returns {Number} The floor price if exists, or 0
 */
function getFloor(bid, mediaType) {
  if (!isFn(bid.getFloor)) {
    return 0;
  }

  let floorResult = bid.getFloor({
    currency: DEFAULT_CURRENCY,
    mediaType: mediaType,
    size: '*'
  });

  const floorPrice = floorResult.floor || 0;
  const isDefaultCurrency = floorResult.currency === DEFAULT_CURRENCY;

  return isDefaultCurrency && floorPrice
}

/**
 * Get the the ad sizes array from the bid
 * @param {bid} bid
 * @param {mediaType} mediaType
 * @returns {Array} Array of ad sizes
 */
function getSizesArray(bid, mediaType) {
  let bidSizesArray = []

  if (deepAccess(bid, `mediaTypes.${mediaType}.sizes`)) {
    bidSizesArray = bid.mediaTypes[mediaType].sizes;
  } else if (Array.isArray(bid.sizes) && bid.sizes.length > 0) {
    bidSizesArray = bid.sizes;
  }

  return bidSizesArray;
}

/**
 * Get encoded node value
 * @param {string} val
 * @returns {string} valid component of a URI
 */
function getEncodedValIfNotEmpty(val) {
  return !isEmpty(val) ? encodeURIComponent(val) : '';
}

/**
 * Get preferred user-sync method based on publisher configuration
 * @param {string} bidderCode
 * @param {string} filterSettings
 * @returns {string} The sync method
 */
function getConfSyncMethod(filterSettings, bidderCode) {
  const pixelConfigToCheck = 'image';
  const iframeConfigsToCheck = ['all', 'iframe'];

  if (filterSettings && iframeConfigsToCheck.some(config => isSyncMethodSupported(filterSettings[config], bidderCode))) {
    return SUPPORTED_SYNC_METHODS.IFRAME;
  }
  if (!filterSettings || !filterSettings[pixelConfigToCheck] || isSyncMethodSupported(filterSettings[pixelConfigToCheck], bidderCode)) {
    return SUPPORTED_SYNC_METHODS.PIXEL;
  }
}

/**
 * Check if the sync method is supported
 * @param {Object} confRule
 * @param {string} bidderCode
 * @returns {boolean}
 */
function isSyncMethodSupported(confRule, bidderCode) {
  const isInclude = confRule?.filter === 'include';
  const bidders = isArray(confRule?.bidders) ? confRule.bidders : [bidderCode];

  return confRule ? isInclude && contains(bidders, bidderCode) : false;
}

/**
 * Create parameters for each bid
 * @param {Array} validBidRequests
 * @param {bidderRequest} bidderRequest
 * @returns {Array} bids array with its parameters
 */
function createBidParams(validBidRequests, bidderRequest) {
  const bidsArray = [];

  if (validBidRequests.length) {
    validBidRequests.forEach(bidRequest => {
      bidsArray.push(createBidParameters(bidRequest, bidderRequest));
    });
  }

  return bidsArray;
}

/**
 * Get the seller endpoint
 * @param {boolean} testMode
 * @returns {string} The endpoint to use
 */
function getSellerEndpoint(testMode) {
  return testMode
    ? SELLER_ENDPOINT + MODES.TEST
    : SELLER_ENDPOINT + MODES.PRODUCTION;
}

/**
 * get device type
 * @param {userAgent} userAgent - User agent type
 * @returns {string}
 */
function getDeviceType(userAgent) {
  if (/ipad|android 3.0|xoom|sch-i800|playbook|tablet|kindle/i
    .test(userAgent.toLowerCase())) {
    return '5';
  }
  if (/iphone|ipod|android|blackberry|opera|mini|windows\sce|palm|smartphone|iemobile/i
    .test(userAgent.toLowerCase())) {
    return '4';
  }
  if (/smart[-_\s]?tv|hbbtv|appletv|googletv|hdmi|netcast|viera|nettv|roku|\bdtv\b|sonydtv|inettvbrowser|\btv\b/i
    .test(userAgent.toLowerCase())) {
    return '3';
  }
  return '1';
}

/**
 * Generate bid specific parameters
 * @param {bid} bid
 * @param {bidderRequest} bidderRequest
 * @returns {Object} bid specific params object
 */
function createBidParameters(bid, bidderRequest) {
  const {params} = bid;
  const gpid = deepAccess(bid, `ortb2Imp.ext.gpid`);
  const correctedFloorPrice = isNaN(params.floorPrice) ? 0 : params.floorPrice;
  const mediaType = isBanner(bid) ? BANNER : VIDEO;
  const sizesArray = getSizesArray(bid, mediaType);
  const placementId = params.placementId || deepAccess(bid, `mediaTypes.${mediaType}.name`);
  const pos = deepAccess(bid, `mediaTypes.${mediaType}.pos`);

  const bidObject = {
    mediaType,
    adUnitCode: getBidIdParameter('adUnitCode', bid),
    sizes: sizesArray,
    floorPrice: Math.max(getFloor(bid, mediaType), correctedFloorPrice),
    bidId: getBidIdParameter('bidId', bid),
    bidderRequestId: getBidIdParameter('bidderRequestId', bid),
    loop: getBidIdParameter('bidderRequestsCount', bid),
    transactionId: getBidIdParameter('transactionId', bid),
  };

  if (pos) {
    bidObject.pos = pos;
  }

  if (gpid) {
    bidObject.gpid = gpid;
  }

  if (placementId) {
    bidObject.placementId = placementId;
  }

  if (mediaType === VIDEO) {
    const placement = deepAccess(bid, `mediaTypes.video.placement`);
    const minDuration = deepAccess(bid, `mediaTypes.video.minduration`);
    const maxDuration = deepAccess(bid, `mediaTypes.video.maxduration`);
    const skip = deepAccess(bid, `mediaTypes.video.skip`);
    const linearity = deepAccess(bid, `mediaTypes.video.linearity`);
    const playbackMethod = deepAccess(bid, `mediaTypes.video.playbackmethod`);
    let playbackMethodValue;

    if (Array.isArray(playbackMethod) && isInteger(playbackMethod[0])) {
      // according to OpenRTB 2.5, only the first playbackMethod in the array will be used
      playbackMethodValue = playbackMethod[0];
    } else if (isInteger(playbackMethod)) {
      playbackMethodValue = playbackMethod;
    }

    if (playbackMethodValue) {
      bidObject.playbackMethod = playbackMethodValue;
    }

    if (placement) {
      bidObject.placement = placement;
    }

    if (minDuration) {
      bidObject.minDuration = minDuration;
    }

    if (maxDuration) {
      bidObject.maxDuration = maxDuration;
    }

    if (skip) {
      bidObject.skip = skip;
    }

    if (linearity) {
      bidObject.linearity = linearity;
    }
  }

  return bidObject;
}

function isBanner(bid) {
  return bid?.mediaTypes?.banner;
}

/**
 * Create parameters that are used by all bids
 * @param {single bid object} generalObject
 * @param {bidderRequest} bidderRequest
 * @returns {object} the common params object
 */
function createGeneralParams(generalObject, bidderRequest) {
  const domain = window.location.hostname;
  const timeout = config.getConfig('bidderTimeout');
  const generalBidParams = generalObject.params;
  const userIdsParam = getBidIdParameter('userId', generalObject);
  const ortb2Metadata = bidderRequest.ortb2 || {};
  const {bidderCode} = bidderRequest;
  const {syncEnabled, filterSettings} = config.getConfig('userSync') || {};

  const commonParams = {
    wrapper_type: 'prebidjs',
    wrapper_vendor: '$$PREBID_GLOBAL$$',
    wrapper_version: '$prebid.version$',
    adapter_version: ADAPTER_VERSION,
    auction_start: timestamp(),
    publisher_id: generalBidParams.org,
    publisher_name: domain,
    site_domain: domain,
    dnt: (navigator.doNotTrack == 'yes' || navigator.doNotTrack == '1' || navigator.msDoNotTrack == '1') ? 1 : 0,
    device_type: getDeviceType(navigator.userAgent),
    ua: navigator.userAgent,
    session_id: getBidIdParameter('auctionId', generalObject),
    tmax: timeout
  }

  if (userIdsParam) {
    commonParams.userIds = JSON.stringify(userIdsParam);
  }

  if (ortb2Metadata.site) {
    commonParams.site_metadata = JSON.stringify(ortb2Metadata.site);
  }

  if (ortb2Metadata.user) {
    commonParams.user_metadata = JSON.stringify(ortb2Metadata.user);
  }

  if (syncEnabled) {
    const allowedSyncMethod = getConfSyncMethod(filterSettings, bidderCode);
    if (allowedSyncMethod) {
      commonParams.cs_method = allowedSyncMethod;
    }
  }

  if (bidderRequest.uspConsent) {
    commonParams.us_privacy = bidderRequest.uspConsent;
  }

  if (bidderRequest && bidderRequest.gdprConsent && bidderRequest.gdprConsent.gdprApplies) {
    commonParams.gdpr = bidderRequest.gdprConsent.gdprApplies;
    commonParams.gdpr_consent = bidderRequest.gdprConsent.consentString;
  }

  if (generalBidParams.ifa) {
    commonParams.ifa = generalBidParams.ifa;
  }

  if (bidderRequest && bidderRequest.refererInfo) {
    commonParams.page_url = deepAccess(bidderRequest, 'refererInfo.page') || deepAccess(window, 'location.href');
    commonParams.referrer = deepAccess(bidderRequest, 'refererInfo.ref');
  }

  if (generalObject.schain) {
    commonParams.schain = getSupplyChain(generalObject.schain);
  }

  return commonParams
}

function createBidsObject(sharedParamsObject, bidderRequest, validBidRequests) {
  const bidsObject = {
    params: createGeneralParams(sharedParamsObject, bidderRequest),
    bids: createBidParams(validBidRequests, bidderRequest)
  };

  return bidsObject;
}

function parseResponses(bidResponses) {
  const bidsArray = [];

  bidResponses.forEach(bid => {
    const bidResponse = {
      requestId: bid.requestId,
      currency: bid.currency || DEFAULT_CURRENCY,
      width: bid.width,
      height: bid.height,
      ttl: bid.ttl || TTL,
      cpm: bid.cpm,
      creativeId: bid.requestId,
      netRevenue: bid.netRevenue || true,
      nurl: bid.nurl,
      mediaType: bid.mediaType,
      meta: {
        mediaType: bid.mediaType
      }
    };

    if (bid.mediaType === VIDEO) {
      bidResponse.vastXml = bid.vastXml;
    } else if (bid.mediaType === BANNER) {
      bidResponse.ad = bid.ad;
    }

    if (bid.adomain && bid.adomain.length) {
      bidResponse.meta.advertiserDomains = bid.adomain;
    }

    bidsArray.push(bidResponse);
  });

  return bidsArray;
}

/**
 * Get schain string value
 * @param {Object} schainObject
 * @returns {string} schain string
 */
function getSupplyChain(schainObject) {
  let scStr = `${schainObject.ver},${schainObject.complete}`;

  if (isEmpty(schainObject)) {
    return '';
  }
  schainObject.nodes.forEach((node) => {
    scStr += '!';
    scStr += `${getEncodedValIfNotEmpty(node.asi)},`;
    scStr += `${getEncodedValIfNotEmpty(node.sid)},`;
    scStr += `${node.hp ? encodeURIComponent(node.hp) : ''},`;
    scStr += `${getEncodedValIfNotEmpty(node.rid)},`;
    scStr += `${getEncodedValIfNotEmpty(node.name)},`;
    scStr += `${getEncodedValIfNotEmpty(node.domain)}`;
  });
  return scStr;
}

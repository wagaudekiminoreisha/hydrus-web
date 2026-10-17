const {allowed,deny,PREFIX}=require('./local-integration-proxy.cjs');
module.exports={
  ...require('../proxy.conf.json'),
  [PREFIX]:{
    target:process.env.HYDRUS_WEB_INTERNAL_TARGET,
    changeOrigin:true,
    pathRewrite:{['^'+PREFIX]:''},
    bypass(request,response){if(!allowed(request)){deny(response);return false;}},
    onProxyReq(proxyRequest){
      proxyRequest.setHeader('Authorization','Bearer '+process.env.HYDRUS_WEB_INTERNAL_TOKEN);
      proxyRequest.removeHeader('Origin');
    }
  }
};

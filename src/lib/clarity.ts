/** Microsoft Clarity project for production session recordings. */
export const CLARITY_PROJECT_ID = "yq1riyzvx3";

/**
 * Record real production traffic only. `next dev` stays quiet, and Vercel
 * preview deployments do not share the production project. Railway, GoDaddy,
 * and Vercel production leave VERCEL_ENV unset or set to "production".
 */
export function clarityRecordingEnabled(env: { nodeEnv?: string; vercelEnv?: string }) {
  if (env.nodeEnv !== "production") return false;
  return env.vercelEnv !== "preview" && env.vercelEnv !== "development";
}

const SECRET_FIELDS =
  "input[type='password'],input[type='email'],input[type='tel'],input[type='hidden'],textarea";

export function clarityHeadScript() {
  return `(function(c,l,a,r,i,t,y){
        c[a]=c[a]||function(){(c[a].q=c[a].q||[]).push(arguments)};
        t=l.createElement(r);t.async=1;t.src="https://www.clarity.ms/tag/"+i;
        y=l.getElementsByTagName(r)[0];y.parentNode.insertBefore(t,y);
    })(window, document, "clarity", "script", "${CLARITY_PROJECT_ID}");
clarity("set","surface","production");
(function(){
    var selector="${SECRET_FIELDS}";
    function mark(node){
      if(!node||node.nodeType!==1)return;
      if(node.matches&&node.matches(selector))node.classList.add("clarity-mask");
      if(!node.querySelectorAll)return;
      var list=node.querySelectorAll(selector);
      for(var i=0;i<list.length;i++)list[i].classList.add("clarity-mask");
    }
    function start(){
      mark(document.documentElement);
      new MutationObserver(function(records){
        for(var i=0;i<records.length;i++){
          mark(records[i].target);
          var added=records[i].addedNodes;
          for(var j=0;j<added.length;j++)mark(added[j]);
        }
      }).observe(document.documentElement,{childList:true,subtree:true});
    }
    if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",start);
    else start();
  })();`;
}

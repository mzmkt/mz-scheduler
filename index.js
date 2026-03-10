const express = require('express');
const fetch = require('node-fetch');

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;
const BUFFER_TOKEN = process.env.BUFFER_TOKEN;

const INSTAGRAM_ID = "COLE_AQUI";
const LINKEDIN_ID = "COLE_AQUI";

app.get("/", (req,res)=>{
 res.json({status:"ok"});
});

app.post("/schedule", async (req,res)=>{

 const {copy_ig,copy_li,scheduled_at} = req.body;

 try{

   const ig = await createPost(INSTAGRAM_ID,copy_ig,scheduled_at);
   const li = await createPost(LINKEDIN_ID,copy_li,scheduled_at);

   res.json({ok:true,ig,li});

 }catch(e){

   res.status(500).json({error:e.message});

 }

});

async function createPost(profileId,text,scheduledAt){

 const params = new URLSearchParams();

 params.append("profile_ids[]",profileId);
 params.append("text",text);
 params.append("scheduled_at",scheduledAt);
 params.append("access_token",BUFFER_TOKEN);

 const resp = await fetch(
   "https://api.buffer.com/1/updates/create.json",
   {
     method:"POST",
     body:params
   }
 );

 return resp.json();

}

app.listen(PORT,()=>{
 console.log("scheduler rodando");
});

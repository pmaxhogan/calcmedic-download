const fetch = require("node-fetch");
const fs = require("fs");
const {exec} = require("child_process");
const fsPromises = require("fs").promises;

let authorizationToken;
let blocksAccessToken;
let schoolId;
if(!process.argv[2] || process.argv[5]){
    console.log(`Usage:
${process.argv[0]} ${process.argv[1]} [authorizationToken] [blocksAccessToken] [schoolId]
${process.argv[0]} ${process.argv[1]} [harFile]

Run this from the directory that you want data to be downloaded to.

It's recommended that you use a HAR file to log in to the scraper. To do this, open the Chrome DevTools network panel, reload a calcmedic page, and click "Export HAR..." (the "download" button is the last button in the row right below the network tab). Provide the path to this file as the first argument.

If you want to manually provide request parameters, you can:
    authorizationToken should be the token provided in the authorization header (without the Bearer part), eg. eyJ0eXAiOiJ...
    blocksAccessToken should be the token provided in the x-blocks-access-token, eg. eyJhbGciOiJ...
    schoolId should be the ID of your school, found in the school_id query parameter 
`);
    process.exit();
}

if(process.argv[3]){
    if(process.argv[2].includes("Bearer")){
        throw new Error("Don't put Bearer in your token");
    }
    authorizationToken = "Bearer " + process.argv[2];
    blocksAccessToken = process.argv[3];
    schoolId = process.argv[4];
}else{
    try {
        const har = JSON.parse(fs.readFileSync(process.argv[2]).toString());
        const headers = har.log.entries.find(entry => entry.request.headers.find(header => header.name === "x-blocks-access-token")).request.headers;

        // get tokens from the request that has them
        authorizationToken = headers.find(header => header.name === "authorization").value;
        blocksAccessToken = headers.find(header => header.name === "x-blocks-access-token").value;

        // find a request with a ?school_id= query parameter and get the school id from there
        schoolId = har.log.entries.find(entry =>
            entry.request.queryString.find(queryPart => queryPart.name === "school_id")).
        request.queryString.find(queryPart => queryPart.name === "school_id").value;
    }catch(e){
        console.error("Could not read HAR file or get authorization from file. Try reloading a page with the network tab open.");
        throw e;
    }
}

// runs a query to the database

const runQuery = (operationName, variables, query, blocks=true)=>{
    return fetch(`https://gql.pathwright.com/${blocks ? "blocks/" : ""}graphql?school_id=${schoolId}`, {
        "headers": {
            "authorization": authorizationToken,
            "content-type": "application/json",
            "x-blocks-access-token": blocksAccessToken
        },
        "body": JSON.stringify({
            operationName,
            variables,
            query
        }),
        "method": "POST"
    }).then(x=>x.json());
};
const lookUpPage = key =>
    runQuery("BlocksContent", {
        "mode": "VIEW",
        "id": null,
        "contextKey": "/" + key,
        "template": null,
        "upsert": false,
        "draft": false
    }, `
query BlocksContent($id: ID, $mode: MODE!, $contextKey: String!, $template: String, $draft: Boolean!, $upsert: Boolean) {
  content: Content(id: $id, mode: $mode, contextKey: $contextKey, template: $template, draft: $draft, upsert: $upsert) {
    ...contentFields
    __typename
  }
}

fragment contentFields on Content {
  blocks {
    ...contentBlockFields
    __typename
  }
  __typename
}

fragment contentBlockFields on ContentBlock {
  data
}
`);
const lookUpEmbed = id =>
// look up embed
    runQuery("Embed", {id,"copiedFromAccountID":null}, `query Embed($id: ID!, $copiedFromAccountID: ID) {
  muxVideoEmbed(id: $id, copiedFromAccountID: $copiedFromAccountID) {
    stream {
      url
    }
  }
}
`);

runQuery("PathItemsQuery", {
    "id": null,
    "cohort_id": 128442
}, `query PathItemsQuery($id: Int, $cohort_id: Int, $cursor: String) {
  path(id: $id, cohort_id: $cohort_id) {
    ...Path
    __typename
  }
}

fragment Path on Path {
  id
  progress
  points {
    total
    earned
    percentage
    __typename
  }
  next_step_id
  completion_date
  created_date
  sync {
    synced
    last_synced_date
    sync_source_path_id
    __typename
  }
  user {
    id
    email
    first_name
    last_name
    full_name
    display_name
    profile {
      bio
      image(width: 150, height: 150, fit: clamp)
      location
      last_activity
      __typename
    }
    __typename
  }
  items(flatten: true, first: 1000, after: $cursor) {
    pageInfo {
      endCursor
      hasNextPage
      __typename
    }
    edges {
      node {
        id
        order
        name
        type
        verb
        path_id
        source_id
        parent_id
        parent_source_id
        description
        content_id
        assignment_type
        content_type
        item_content_type_id
        progress
        time_to_complete
        points
        minimum_passing_score
        is_required
        is_previewable
        due
        starts
        has_started
        item_needs_grading
        grading_type
        is_locked
        lock_password
        lock_unlocked_time
        completion_comment_required_status
        allow_resets
        show_grading_feedback
        permissions {
          can_complete
          can_discuss
          can_edit
          can_edit_content
          can_note
          can_view
          can_view_content
          __typename
        }
        completion {
          id
          checked_date
          completion_attempts
          completion_comment
          completion_date
          last_completion_attempt_date
          has_failed_passing_attempt
          completion_due
          has_points
          is_late
          is_graded
          is_skipped
          is_complete
          is_auto_graded
          is_forced_completion
          needs_grading
          userpoints_earned
          userpoints_explanation
          userpoints_value
          grading_type
          checked_by {
            id
            email
            first_name
            last_name
            full_name
            display_name
            profile {
              bio
              image(width: 150, height: 150, fit: clamp)
              location
              last_activity
              __typename
            }
            __typename
          }
          user {
            id
            email
            first_name
            last_name
            full_name
            display_name
            profile {
              bio
              image(width: 150, height: 150, fit: clamp)
              location
              last_activity
              __typename
            }
            __typename
          }
          submission {
            id
            text
            file_url
            file_name
            file_image
            __typename
          }
          __typename
        }
        __typename
      }
      __typename
    }
    __typename
  }
  __typename
}

`, false).then(async data => {
    console.log(data);
//     let str = "";
    let promises = [];
    data.data.path.items.edges.forEach(part => {
        promises.push((async () => {
            const {content_type, name, source_id, description, parent_id} = part.node;
            let path;
            if(parent_id){
                path = data.data.path.items.edges.find(thisPart => thisPart.node.id === parent_id).node.name;
                await mkdir(path);
            }
            if(content_type === "assessment"){
                await download(path + "/" + name + ".pdf", /<a href="([^"]*)"/.exec(description)[1]);
                await fsPromises.writeFile( path + "/" + name + ".html", `${name}\n${description}`);
            }else if(parent_id){
                const page = await lookUpPage(source_id);
                const block = page.data.content && page.data.content.blocks;
                if(block){
                    for(const data of block.map(contentBlock => contentBlock.data)){
                        if(data.text){
                            await fsPromises.writeFile(path + "/" + name + ".html", data.text + "\n\t\t" + data.src);
                        }else if(data.files){
                            for(const file of data.files){
                                await download( path + "/" + file.name, file.url);
                            }
                        }else if(data.html){
                            await fsPromises.writeFile(path + "/" + name + ".html", data.html);
                        }else if(data.muxVideoID){
                            await downloadStream(path + "/" + name + ".mp4", (await lookUpEmbed(data.muxVideoID)).data.muxVideoEmbed.stream.url);
                        }
                    }
                }else{
                    await download(path + "/" + name + ".pdf", /<a href="([^"]*)"/.exec(description)[1]);
                    await fsPromises.writeFile( path + "/" + name + ".html", `${name}\n${description}`);
                }
            }else{
                await mkdir(name);
            }
        })());
    });
    await Promise.all(promises);
    console.log("done");
});

const download = (path, url) => new Promise((resolve, reject) => {
    console.log("downloading: " + url);
    fetch(url).then(res => {
            console.log("downloaded: " + url);
            if(!res.ok) return reject();
            const dest = fs.createWriteStream(path);
            res.body.pipe(dest).on("finish", resolve).on("error", reject);
    }).catch(reject);
});

const mkdir = async dir => {
    try{
        await fsPromises.mkdir(dir);
    }catch(e){
        if(!e.code === "EEXIST") throw e;
    }
};

const downloadStream = (path, url) => new Promise((resolve, reject) => {
    console.log("downloading stream: " + url);
    exec(`youtube-dl -o '${path}' '${url}'`, (error) => {
        console.log("downloaded stream: " + url);
        if(error) reject();
        else resolve();
    });
});

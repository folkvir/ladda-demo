const NDP = require("foglet-ndp").NDP;
const LaddaProtocol = require("foglet-ndp").LaddaProtocol;

const defaultQuery = [
   " PREFIX wd: <http://www.wikidata.org/entity/> SELECT * WHERE { ?s ?p wd:Q142. ?s ?p ?o . } LIMIT 500",
   " PREFIX wd: <http://www.wikidata.org/entity/> SELECT * WHERE { ?s ?p wd:Q142. ?s ?p ?o . } OFFSET 1000 LIMIT 500",
   " PREFIX wd: <http://www.wikidata.org/entity/> SELECT * WHERE { ?s ?p wd:Q142. ?s ?p ?o . } OFFSET 2000 LIMIT 500"
];

let spray;
let foglet;
let timeline;

let endpoint;
let queries;
let queriesWithId;
let executedQueries;
let delegationNumber;

let globalStartTime;
let globalExecutionTime;
let cumulatedExecutionTime;
let improvementRatio;

let neighboursQueriesExecuted;

// Connect to ICE server
$(document).ready(function() {

    /* Haven't spent time on this ajax stuff,
        We should probably change some settings. */
    $.ajax({
        url : "https://service.xirsys.com/ice",
        data : {
            ident: "folkvir",
            secret: "a0fe3e18-c9da-11e6-8f98-9ac41bd47f24",
            domain: "foglet-examples.herokuapp.com",
            application: "foglet-examples",
            room: "sparqldistribution",
            secure: 1
        },
        success: function(response, status) {
            let iceServers;
            if (response.d.iceServers) {
                iceServers = response.d.iceServers;
            }

            console.log(iceServers);
            const ices = [];
            iceServers.forEach(ice => {
              console.log(ice);
              if(ice.credential && ice.username){
                  ices.push({ urls: ice.url, credential: ice.credential, username: ice.username });
              } else {
                  ices.push({ urls: ice.url });
              }

            })
            console.log(ices);
            createFoglet(ices);
        }
    });

});

/* Create foglet and initiate connection */
function createFoglet(iceServers) {
    foglet = new NDP({
        protocol: "laddademo",
        webrtc: {
            trickle: false,
            iceServers
        },
        deltatime: 1000 * 60 * 15,
        timeout: 1000 * 60 * 60,
        room: "test-laddademo",
        signalingAdress: "https://signaling.herokuapp.com/",
        delegationProtocol: new LaddaProtocol(),
        decoding: (data) => {
          return JSON.parse(data);
        },
				encoding: (data) => {
          return JSON.stringify(data);
        }
    });

    foglet.init();

    foglet.onUnicast(function(id, message) {
        if (message.type === 'request') {
            onReceiveRequest(id, message);
        }
    });

		foglet.events.on('ndp-error', function(message) {
			onQueryError(message);
		});

		foglet.events.on('ndp-timeout', function(message) {
			onQueryTimeout(message);
		});

		foglet.events.on('ndp-failed', function(message) {
			onQueryFailed(message);
		});

		foglet.events.on('ndp-delegated', function(message) {
			onQueryDelegated(message);
		});

		foglet.events.on('ndp-delegated-query-executed', function(message) {
			onQueryDelegatedExecuted(message);
		});

    foglet.events.on("ndp-answer", function(message) {
      console.log(message);
        onReceiveAnswer(message);
    });

    foglet.connection().then(function(s) {
        onFogletConnected();
    });

    neighboursQueriesExecuted = 0;

		createListeners();
		clearInterface();

    setTimeout( () => {
      updateNeighboursCount();
    }, 5000);
}

/* create all listeners to create queries status table */
function createListeners(){
	$('#queries').on('change', function(){
		let q = $('#queries').val();
		try {
			q = JSON.parse(q);
		} catch (e) {
			alert('Queries are not well-formated. Try again ! \n Reason :' + e.toString());
		}
	});
}

function initTableStatus(){
	let q = queriesWithId;
	let text = "";
	let i = 0;
	q.forEach(p => {
		text += "<tr class='' id='tr" + p.id + "'> <th scope='row'>" + i + "</th> <td class='statusQuery' id='" + p.id + "' >" + p.query + "</td>" + "<td id='status" + p.id + "'> "+ foglet.delegationProtocol.queryQueue.getStatus(p.id) +" </td> </tr>";
		++i;
	});

	$('#statusQueryBody').html(text);
}

/* listeners */
function onQueryError(message) {
	console.log('[LADDA-DEMO] Error query: ', message);
	alert(message);
}
function onQueryTimeout(message) {
	console.log('[LADDA-DEMO] Timeout query: ', message);
	findQuery(message, 'bg-danger');
}
function onQueryFailed(message) {
	console.log('[LADDA-DEMO] Failed query: ', message);
	findQuery(message, 'bg-danger');
  console.log('[LADDA-DEMO] Delegated query executed: ', message);
	let cl = "bg-success";
	if(message.type === 'failed'){
		cl = "bg-danger";
	}
	$('#delegatedQueriesExecutedBody').append("<tr> <th class='"+cl+"'>"+message.id+"</th> <th class='"+cl+"'>"+message.payload+"</th> <th class='"+cl+"'>"+message.endpoint+"</th> </tr>");
}
function onQueryDelegated(message) {
	console.log('[LADDA-DEMO] Delegated query: ', message);
	findQuery(message, 'bg-delegated');
}
function onQueryDelegatedExecuted(message) {
	console.log('[LADDA-DEMO] Delegated query executed: ', message);
	let cl = "bg-success";
	if(message.type === 'failed'){
		cl = "bg-danger";
	}
	$('#delegatedQueriesExecutedBody').append("<tr> <th class='"+cl+"'>"+message.schedulerId+"</th> <th class='"+cl+"'>"+message.query+"</th> <th class='"+cl+"'>"+message.endpoint+"</th> </tr>");
}

function findQuery(query, type){
	$('#tr'+query.qId + ' td, #tr'+query.qId + ' th').removeClass();
	$('#tr'+query.qId + ' td, #tr'+query.qId + ' th').addClass(type);
	const status = foglet.delegationProtocol.queryQueue.getStatus(query.qId);
	$('#status'+query.qId).html(foglet.delegationProtocol.queryQueue.getStatus(query.qId));
}



/* show or hide table */
function showQueriesArea() {
	$('#queries-status').hide();
	$('#queries-area').show();
}
function showQueryStatus() {
	$('#queries-area').hide();
	$('#queries-status').show();
}

/* Create the timeline */
function createTimeline() {

    timeline = new vis.Timeline($('#timeline')[0]);
    timeline.setOptions({
        stack: false,
        showCurrentTime: false
    });
    timeline.setGroups(new vis.DataSet());
    timeline.setItems(new vis.DataSet());

    timeline.on('select', function(e) {
        if (e.items[0])
            onItemSelected(timeline.itemsData.get(e.items[0]));
    });
}

/* Send the queries */
function sendQueries() {
    clearInterface();
    createTimeline();
		showQueryStatus();
    endpoint = $('#endpoint').val();
    delegationNumber = $('#delegation_number').val();
    queries = JSON.parse($('#queries').val());

    updateNeighboursCount();

    foglet.delegationProtocol.nbDestinations = delegationNumber;

    // Initialize variables
    executedQueries = 0;
    globalStartTime = vis.moment(new Date());
    cumulatedExecutionTime = vis.moment.duration();

    foglet.send(queries, endpoint);
		queriesWithId = foglet.delegationProtocol.queryQueue.queries.toJS();
		initTableStatus();
    $('#send_queries').addClass("disabled");
}

/* Update neighbours count */
function updateNeighboursCount() {
    // TO DO: Understand why it never changes...
    const neigh = foglet.options.spray.getPeers();
    console.log(neigh);
    $('#neighbours_count').html(Math.max(neigh.o.length, neigh.i.length));

    // add neighbours to the timeline
    // If new peer
    // neigh.forEach(id => {
    //   if (!timeline.groupsData.getDataSet().get(id)) {
    //       // Add a new group
    //       timeline.groupsData.getDataSet().add({
    //           id: id,
    //           title: 'Peer: '+id
    //       });
    //   }
    // });

}

/* Executed when the foglet is connected */
function onFogletConnected() {
    console.log("You are now connected!");
    updateNeighboursCount();
    $('#send_queries').removeClass("disabled");
}

/* Executed when a Sparql query is received to be executed */
function onReceiveRequest(id, message) {
    updateNeighboursCount();
    console.log('You are executing a query from a neighbour!');
    neighboursQueriesExecuted++;
    $('#neighbours_queries_executed').html(neighboursQueriesExecuted);
}

/* Executed when a Sparql answer is received */
function onReceiveAnswer(message) {
		console.log('[LADDA-DEMO] Receive answer: ', message);
		findQuery(message, 'bg-ok');
    executedQueries++;
    let start = vis.moment(message.startExecutionTime, "h:mm:ss:SSS");
    let end = vis.moment(message.endExecutionTime, "h:mm:ss:SSS");
    cumulatedExecutionTime.add(vis.moment.duration(end.diff(start)));

    // If last query
    if (executedQueries == queries.length) {
        $('#send_queries').removeClass("disabled");
        globalExecutionTime = vis.moment.duration(vis.moment(new Date()).diff(globalStartTime));
        improvementRatio = Math.floor((cumulatedExecutionTime.asMilliseconds() / globalExecutionTime.asMilliseconds())*1000)/1000;
        showTimelogs();
    }

    // If new peer
    if (!timeline.groupsData.getDataSet().get(message.id)) {
        // Add a new group
        timeline.groupsData.getDataSet().add({
            id: message.id,
            title: 'Peer: '+message.id
        });
    }

    // Add a new item
    timeline.itemsData.add({
        id: message.qId,
        group: message.id,
        title: message.payload.length+" results",
        content: message.qId,
        start: start,
        end: end,
        message: message
    });

    // Update timeline range
    timeline.setOptions({
        start: timeline.getItemRange().min,
        end: timeline.getItemRange().max
    });
}

function showTimelogs() {
    $('#global_execution_time').html(
        globalExecutionTime.hours()+
        ":"+
        globalExecutionTime.minutes()+
        ":"+
        globalExecutionTime.seconds()+
        ","+
        ("000"+globalExecutionTime.milliseconds())
            .substr((""+globalExecutionTime.milliseconds()).length)
    );
    $('#cumulated_execution_time').html(
        cumulatedExecutionTime.hours()+
        ":"+
        cumulatedExecutionTime.minutes()+
        ":"+
        cumulatedExecutionTime.seconds()+
        ","+
        ("000"+cumulatedExecutionTime.milliseconds())
            .substr((""+cumulatedExecutionTime.milliseconds()).length)
    );
    $('#improvement_ratio').html(improvementRatio);
}

function clearInterface() {
		$('#queries-area').show();
		$('#queries-status').hide();
    $('#global_execution_time').html("--");
    $('#cumulated_execution_time').html("--");
    $('#improvement_ratio').html("--");
    $('#timeline').html(" ");
    $('#item').hide();
    $('#send_queries').addClass("disabled");
}

function onItemSelected(item) {
    $('#item').show();
    $('.qId').html(item.message.qId);
    $('.id').html(item.message.id);
    $('.query').html(item.message.query);
    $('.started_at').html(item.message.startExecutionTime);
    $('.ended_at').html(item.message.endExecutionTime);
    $('.payload').html(JSON.stringify(item.message.payload, null, 4));
    $("#mymodal").modal('toggle');

}

function modalDelegated(){
	$("#delegatedModal").modal('toggle');
}

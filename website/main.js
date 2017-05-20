const NDP = require("foglet-ndp").NDP;
const LaddaProtocol = require("foglet-ndp").LaddaProtocol;


localStorage.debug = 'foglet-*';

const defaultQuery = [
   " PREFIX wd: <http://www.wikidata.org/entity/> SELECT * WHERE { ?s ?p wd:Q142. ?s ?p ?o . } LIMIT 500",
   " PREFIX wd: <http://www.wikidata.org/entity/> SELECT * WHERE { ?s ?p wd:Q142. ?s ?p ?o . } OFFSET 1000 LIMIT 500",
   " PREFIX wd: <http://www.wikidata.org/entity/> SELECT * WHERE { ?s ?p wd:Q142. ?s ?p ?o . } OFFSET 2000 LIMIT 500"
];

let spray;
let foglet;
let timeline;
let workloadId = 0;

let endpoint;
let queries;
let peers;
let answers = {};
let queriesWithId;
let executedQueries;
let delegationNumber;

let globalStartTime;
let globalExecutionTime, globalExec = 0;
let cumulatedExecutionTime, cumulExec = 0;
let overhead;
let improvementRatio;

let neighboursQueriesExecuted;

// Connect to ICE server
$(document).ready(function() {

    /* Haven't spent time on this ajax stuff,
        We should probably change some settings. */
    $.ajax({
        url : "/ice",
        success: function(response, status) {
            let iceServers;
            if (response.ice) {
                iceServers = response.ice;
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
            trickle: true,
            iceServers
        },
        deltatime: 1000 * 30,
        timeout: 1000 * 60 * 60,
        room: "laddademo-prod",
        signalingAdress: "https://signaling.herokuapp.com/",
        delegationProtocol: new LaddaProtocol(),
        rpsType: 'fcn-wrtc',
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

		foglet.delegationProtocol.on('ndp-error', function(message) {
			onQueryError(message);
		});

		foglet.delegationProtocol.on('ndp-timeout', function(message) {
			onQueryTimeout(message);
		});

		foglet.delegationProtocol.on('ndp-failed', function(message) {
			onQueryFailed(message);
		});

		foglet.delegationProtocol.on('ndp-delegated', function(message) {
			onQueryDelegated(message);
		});

		foglet.delegationProtocol.on('ndp-delegated-query-executed', function(message) {
			onQueryDelegatedExecuted(message);
		});

    foglet.delegationProtocol.on("ndp-answer", function(message) {
      if(!answers[message.qId]){
        console.log(message);
        answers[message.qId] = message;
        onReceiveAnswer(message);
      }
    });

    foglet.on('connected', () => {
      setTimeout(() => {
        updateNeighboursCount();
      }, 5000);
    });

    foglet.connection().then(function(s) {
        onFogletConnected();
    });

    neighboursQueriesExecuted = 0;

		createListeners();
		clearInterface();
    $('.send_queries').removeClass("disabled");

}

/* create all listeners to create queries status table */
function createListeners(){
	$('#queries').on('change', function(){
		let q = $('#queries').val();
		try {
			q = JSON.parse(q);
      workloadId++;
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
  $('#btnShowStatus').show();
  $('#btnShowQueries').hide();
}
function showQueryStatus() {
	$('#queries-area').hide();
	$('#queries-status').show();
  $('#btnShowStatus').hide();
  $('#btnShowQueries').show();
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
function sendQueries(timeout) {
		if(!timeout) foglet.delegationProtocol.timeout = 10 * 1000;
    foglet.delegationProtocol.timeout = eval(timeout);
    clearInterface();
    createTimeline();
		showQueryStatus();
    endpoint = $('#endpoint').val();
    delegationNumber = eval($('#delegation_number').val());
    queries = JSON.parse($('#queries').val());

    updateNeighboursCount();

    foglet.delegationProtocol.nbDestinations = 3;

    // Initialize variables
    globalExec = 0;
		cumulExec = 0;
    executedQueries = 0;
    globalStartTime = vis.moment(new Date());
    cumulatedExecutionTime = vis.moment.duration();

    foglet.send(queries, endpoint);
		queriesWithId = foglet.delegationProtocol.queryQueue.queries.toJS();
		initTableStatus();
    $('.send_queries').addClass("disabled");
}

/* Update neighbours count */
function updateNeighboursCount() {
    // TO DO: Understand why it never changes...
    const neigh = foglet.getNeighbours();
    console.log(neigh);
    $('#neighbours_count').html(neigh.length);
}

/* Executed when the foglet is connected */
function onFogletConnected() {
    console.log("You are now connected!");
    updateNeighboursCount();
		$('.send_queries').removeClass("disabled");
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
    const p = executedQueries * 100 / queries.length;
    $('#statusQueriesExecution').text(p + "%");
    $('#statusQueriesExecution').attr('aria-valuenow',  p);
    $('#statusQueriesExecution').css('width',  p + "%");
    let start = vis.moment(message.startExecutionTime, "h:mm:ss:SSS");
    let end = vis.moment(message.endExecutionTime, "h:mm:ss:SSS");

		globalExec += message.globalExecutionTime;
		cumulExec += message.executionTime;

    cumulatedExecutionTime.add(vis.moment.duration(end.diff(start)));

    // If last query
    if (executedQueries == queries.length) {
        computeStats(cumulatedExecutionTime);
        updateChart({
          id: workloadId,
          name: 'Experiment #'+ experiments ,
          delegationNumber: foglet.delegationProtocol.nbDestinations,
          queriesNumber: executedQueries,
          executionTime: globalExec
        });
    }

    // If new peer
    if (!timeline.groupsData.getDataSet().get(message.id)) {
        // Add a new group
        if(message.id !== 'me'){
          timeline.groupsData.getDataSet().add({
              id: message.id,
              title: 'Neighbor '+message.id,
              content: 'Neighbor: '+(peers+1)
          });
          peers++;
        } else {
          timeline.groupsData.getDataSet().add({
            id: message.id,
            title: 'Neighbor '+message.id,
          });
        }
    }

    const queryIndex = _.findIndex(queriesWithId, (obj) => obj.id === message.qId);
    const queryTitle = queryIndex;
    // Add a new item
    timeline.itemsData.add({
        id: message.qId,
        group: message.id,
        title: message.payload.length+" results",
        content: ''+queryTitle,
        start: start,
        end: end,
        message: message
    });

    // Update timeline range
    timeline.setOptions({
        start: timeline.getItemRange().min,
        end: timeline.getItemRange().max
    });

    $('.send_queries').removeClass('disabled');

}

function computeStats(){
  let globalEnd = (new Date()).getTime();
	cumulatedExecutionTime = vis.moment.duration(cumulExec);
	globalExecutionTime = vis.moment.duration(globalEnd - globalStartTime);
	// Overhead total
	overhead = vis.moment.duration(globalExec - cumulExec);


	improvementRatio = Math.floor((cumulatedExecutionTime.asMilliseconds() / globalExecutionTime.asMilliseconds())*1000)/1000;
	showTimelogs();
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
            .substr((""+globalExecutionTime.milliseconds()).length)+ '(s)');
    $('#cumulated_execution_time').html(
        cumulatedExecutionTime.hours()+
        ":"+
        cumulatedExecutionTime.minutes()+
        ":"+
        cumulatedExecutionTime.seconds()+
        ","+
        ("000"+cumulatedExecutionTime.milliseconds())
            .substr((""+cumulatedExecutionTime.milliseconds()).length)+ '(s)');
    $('#improvement_ratio').html(improvementRatio);
    $('#overhead').html(overhead.hours()+
    ":"+
    overhead.minutes()+
    ":"+
    overhead.seconds()+
    ","+
    ("000"+overhead.milliseconds())
        .substr((""+overhead.milliseconds()).length) + '(s)');
}

function clearInterface() {
    answers = {};
    peers = 0;
		$('#queries-area').show();
		$('#queries-status').hide();
    $('#global_execution_time').html("--");
    $('#cumulated_execution_time').html("--");
    $('#improvement_ratio').html("--");
    $('#timeline').html(" ");
    $('#item').hide();
    $('.send_queries').addClass("disabled");
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




/**
 * *************************************************************************
 * *************************************************************************
 * *************************************************************************
 * *************************************************************************
 */

// structures
function randomIntFromInterval(min,max)
{
    return Math.floor(Math.random()*(max-min+1)+min);
}
function randomColor(a){
  let r,g,b;
  r = randomIntFromInterval(0, 255);
  g = randomIntFromInterval(0,255);
  b = randomIntFromInterval(0,255);
  return `rgba(${r},${g},${b}, ${a})`
}
//
let experiments = 1;
let datasets = new Map();
var ctx, chart;
var defaultDataset = {
    id: null,
    label: '',
    fill: false,
    lineTension: 0.1,
    backgroundColor: "rgba(75,192,192,0.4)",
    borderColor: "rgba(75,192,192,1)",
    borderCapStyle: 'butt',
    borderDash: [],
    borderDashOffset: 0.0,
    borderJoinStyle: 'miter',
    pointBorderColor: "rgba(75,192,192,1)",
    pointBackgroundColor: "#fff",
    pointBorderWidth: 1,
    pointHoverRadius: 5,
    pointHoverBackgroundColor: "rgba(75,192,192,1)",
    pointHoverBorderColor: "rgba(220,220,220,1)",
    pointHoverBorderWidth: 2,
    pointRadius: 1,
    pointHitRadius: 10,
    data: [],
    spanGaps: false,
};

function getNewDataset(){
  let newDataset = _.merge({}, defaultDataset)
  newDataset.backgroundColor = randomColor(0.4);
  let c = randomColor(1);
  newDataset.borderColor = c;
  newDataset.pointBorderColor = c;
  newDataset.pointHoverBackgroundColor = c;
  return newDataset;
}

$(document).ready(function() {
  initChart();
});

function statistics_show(){
  $('#statistics_show').hide();
  // show/hide buttons
  $('#statistics_back').show();
  // show the stats page
  $('#statisticsPage').show();
  // hide the main page
  $('#mainPage').hide();
}

function statistics_back(){
  // show/hide buttons
  $('#statistics_show').show();
  $('#statistics_back').hide();
  // hide the stats page
  $('#statisticsPage').hide();
  // show the main page
  $('#mainPage').show();
}

function initChart(){
  ctx = $("#xpChart");
  var data = {
    labels: [],
    datasets: []
  };

  chart = new Chart(ctx, {
      type: 'line',
      data: data,
      options: {
        responsive: true,
        multiTooltipTemplate: "<%%=datasetLabel%>: , <%%= value %>",
        scales: {
          xAxes: [{
              type: 'linear',
              position: 'bottom'
          }],
          yAxes: [{
              ticks: {
                stacked: true,
                beginAtZero:true
              }
          }]
        }
      }
  });
}


function updateChart(executionObject){
  let id = executionObject.id+'-'+executionObject.delegationNumber+'-'+executionObject.queriesNumber;
  if(!datasets.has(id)) datasets.set(id, 0);
  datasets.set(id, datasets.get(id) + 1);

  let find = _.findIndex(chart.data.datasets, function(o) { return o.id === id;});
  if(find < 0){
    let newDataset = getNewDataset();
    newDataset.id = id;
    newDataset.label = `ExecutionTime/D${executionObject.delegationNumber}/Q${executionObject.queriesNumber}`
    chart.data.datasets.push(newDataset);
  }

  find = _.findIndex(chart.data.datasets, function(o) { return o.id === id; })
  //chart.data.labels.push(id);
  chart.data.datasets[find].data.push({
    x: datasets.get(id),
    y:executionObject.executionTime
  });

  chart.update();
  experiments++;
  console.log(executionObject, chart.data.datasets);
}

const NDP = require("foglet-ndp").NDP;
const LaddaProtocol = require("foglet-ndp").LaddaProtocol;


let spray;
let foglet;
let timeline;

let endpoint;
let queries;
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

            createFoglet(iceServers);
        }
    });

});

/* Create foglet and initiate connection */
function createFoglet(iceServers) {
    foglet = new NDP({
        protocol: "sprayExample",
        webrtc: {
            trickle: true,
            iceServers: iceServers
        },
        deltatime: 1000 * 60 * 15,
        timeout: 1000 * 60 * 60,
        room: "sparqldistribution",
        signalingAdress: "https://signaling.herokuapp.com/",
        delegationProtocol: new LaddaProtocol()
    });

    foglet.init();

    foglet.onUnicast(function(id, message) {
        if (message.type === 'request') {
            onReceiveRequest(id, message);
        }
    });

    foglet.events.on("ndp-execute", function(message) {
        // Here, we should receive an event when we start to execute a query
    });

    foglet.events.on("ndp-delegate", function(message) {
        // Here, we should receive an event when we start to delegate a query
    });

    foglet.events.on("ndp-answer", function(message) {
        onReceiveAnswer(message);
    });

    foglet.connection().then(function(s) {
        onFogletConnected();
    });

    neighboursQueriesExecuted = 0;
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

    $('#send_queries').addClass("disabled");
}

/* Update neighbours count */
function updateNeighboursCount() {
    // TO DO: Understand why it never changes...
    $('#neighbours_count').html(foglet.getNeighbours().length);
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
            title: message.id
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
    $('#global_execution_time').html("--");
    $('#cumulated_execution_time').html("--");
    $('#improvement_ratio').html("--");
    $('#timeline').html(" ");
    $('#item').hide();
    $('#send_queries').addClass("disabled");
}

function onItemSelected(item) {
    $('#item').show();
    $('#item .qId').html(item.message.qId);
    $('#item .id').html(item.message.id);
    $('#item .query').html(item.message.query);
    $('#item .started_at').html(item.message.startExecutionTime);
    $('#item .ended_at').html(item.message.endExecutionTime);
    $('#item .payload').html(JSON.stringify(item.message.payload, null, 4));
}

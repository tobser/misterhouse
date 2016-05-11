// Optimization opportunity
//  add print_errorlog
//  updateStaticPage has lots of copy paste


var entity_store = {}; //global storage of entities
var json_store = {};
var updateSocket;
var display_mode;
if (display_mode === undefined) display_mode = "simple";


//Takes the current location and parses the achor element into a hash
function URLToHash() {
	if (location.hash === undefined) return;
	var URLHash = {};
	var url = location.hash.replace(/^\#/, ''); //Replace Hash Entity
	var pairs = url.split('&');
	for (var i = 0; i < pairs.length; i++) {
		var pair = pairs[i].split('=');
		URLHash[decodeURIComponent(pair[0])] = decodeURIComponent(pair[1]);
	}
	return URLHash;
}

//Takes a hash and turns it back into a url
function HashtoURL(URLHash) {
	var pairs = [];
	for (var key in URLHash){
		if (URLHash.hasOwnProperty(key)){
			pairs.push(encodeURIComponent(key) + '=' + encodeURIComponent(URLHash[key]));
		}
	}
	return location.path + "#" + pairs.join('&');
}

//Takes a hash and spits out the JSON request argument string
function HashtoJSONArgs(URLHash) {
	var pairs = [];
	var path = "";
	if (URLHash.path !== undefined) {
		path = URLHash.path;
	}
	delete URLHash.path;
	for (var key in URLHash){
		if (key.indexOf("_") === 0){
			//Do not include private arguments
			continue;
		}
		if (URLHash.hasOwnProperty(key)){
			pairs.push(encodeURIComponent(key) + '=' + encodeURIComponent(URLHash[key]));
		}
	}
	return path + "?" + pairs.join('&');
}

//Gets any arguments in the URL that aren't part of IA7
function HashPathArgs(URLHash) {
	var loc = location.href.split('?');
	if (loc[1] === undefined) {
		return;
	}
	var pairs = loc[1].split('&');
	var rpairs = [];
	for (var i = 0; i < pairs.length; i++) {
		var pair = pairs[i].split('=');
		if (pair[0].indexOf("_") === 0){
			//Do not include private arguments
			continue;
		}
		rpairs.push(pair[0]+"="+pair[1]);
	}
	return  rpairs.join('&');
}

//Stores the JSON data in the proper location based on the path requested
function JSONStore (json){
	var newJSON = {};
	for (var i = json.meta.path.length-1; i >= 0; i--){
		var path = json.meta.path[i];
		if ($.isEmptyObject(newJSON)){
			newJSON[path] = json.data;
		}
		else {
			var tempJSON = {};
			tempJSON[path] = newJSON;
			newJSON = tempJSON;
		}
	}
	newJSON.meta = json.meta;
	//Merge the new JSON data structure into our stored structure
	$.extend( true, json_store, newJSON );
}

//Get the JSON data for the defined path
function getJSONDataByPath (path){
	if (json_store === undefined){
		return undefined;
	}
	var returnJSON = json_store;
	path = path.replace(/^\/|\/$/g, "");
	var pathArr = path.split('/');
	for (var i = 0; i < pathArr.length; i++){
		if (returnJSON[pathArr[i]] !== undefined){
			returnJSON = returnJSON[pathArr[i]];
		}
		else {
			// We don't have this data
			return undefined;
		}
	}
	return returnJSON;
}


//Called anytime the page changes
function changePage (){
	var URLHash = URLToHash();
	if (URLHash.path === undefined) {
		// This must be a call to root.  To speed things up, only request
		// collections
		URLHash.path = "collections";
	}
	if (getJSONDataByPath("ia7_config") === undefined){
		// We need at minimum the basic collections data to render all pages
		// (the breadcrumb)
		// NOTE may want to think about how to handle dynamic changes to the 
		// collections list
		$.ajax({
			type: "GET",
			url: "/json/ia7_config",
			dataType: "json",
			success: function( json ) {
				JSONStore(json);
				changePage();
			}
		});
	} else {
		//console.log("x "+json_store.ia7_config.prefs.substate_percentages);
		if (json_store.ia7_config.prefs.header_button == "no") {
			$("#mhstatus").remove();
		}
		if (json_store.ia7_config.prefs.substate_percentages === undefined) json_store.ia7_config.prefs.substate_percentages = 20;
	}
	if (getJSONDataByPath("collections") === undefined){
		// We need at minimum the basic collections data to render all pages
		// (the breadcrumb)
		// NOTE may want to think about how to handle dynamic changes to the 
		// collections list
		$.ajax({
			type: "GET",
			url: "/json/collections",
			dataType: "json",
			success: function( json ) {
				JSONStore(json);
				changePage();
			}
		});
	} 
	else {
		// Clear Options Entity by Default
		$("#toolButton").attr('entity', '');
		
		//Trim leading and trailing slashes from path
		var path = URLHash.path.replace(/^\/|\/$/g, "");
		if (path.indexOf('objects') === 0){
			loadList();
		}
		else if (path.indexOf('vars') === 0){
			loadVars();
		}
		else if(URLHash._request == 'page'){
			var link = URLHash.link.replace(/\?+.*/,''); //HP for some reason, this often has the first arg with no value, ie ?bob
			var args = HashPathArgs(URLHash);
			if (args !== undefined) {
				args = args.replace(/\=undefined/img,''); //HP sometimes arguments are just items and not key=value...
				link += "?"+args;
			}
			//alert("link="+link);
			//$.get(URLHash.link, function( data ) {
			$.get(link, function( data ) {
				data = data.replace(/<link[^>]*>/img, ''); //Remove stylesheets
				data = data.replace(/<title[^>]*>((\r|\n|.)*?)<\/title[^>]*>/img, ''); //Remove title
				data = data.replace(/<meta[^>]*>/img, ''); //Remove meta refresh
				data = data.replace(/<base[^>]*>/img, ''); //Remove base target tags
				$('#list_content').html("<div id='buffer_page' class='row top-buffer'>");
				$('#buffer_page').append("<div id='row_page' class='col-sm-12 col-sm-offset-0 col-md-10 col-md-offset-1 col-lg-8 col-lg-offset-2'>");
				$('#row_page').html(data);
			});
		}
		else if(path.indexOf('print_log') === 0){
			print_log();
		}
		else if(path.indexOf('print_speaklog') === 0){
			print_log("speak");
		}
		else if(path.indexOf('display_table') === 0){
			var path_arg = path.split('?');
			display_table(path_arg[1]);
		}
		else if(path.indexOf('floorplan') === 0){
			var path_arg = path.split('?');
			floorplan(path_arg[1]);
		}
		else if(path.indexOf('rrd') === 0){
			var path_arg = path.split('?');
			graph_rrd(path_arg[1],path_arg[2]);
		}		
		else if(URLHash._request == 'trigger'){
			trigger();
		}
		else { //default response is to load a collection
			loadCollection(URLHash._collection_key);
		}
		//update the breadcrumb: 
		// Weird end-case, The Group from browse items is broken with parents on the URL
		$('#nav').html('');
		var collection_keys_arr = URLHash._collection_key;
		if (collection_keys_arr === undefined) collection_keys_arr = '0';
		collection_keys_arr = collection_keys_arr.split(',');
		var breadcrumb = '';
		for (var i = 0; i < collection_keys_arr.length; i++){
			var nav_link, nav_name;
			if (collection_keys_arr[i].substring(0,1) == "$"){
				//We are browsing the contents of an object, currently only 
				//group objects can be browsed recursively.  Possibly use different
				//prefix if other recursively browsable formats are later added
				nav_name = collection_keys_arr[i].replace("$", '');
				nav_link = '#path=/objects&parents='+nav_name;
				if (nav_name == "Group") nav_link = '#path=objects&type=Group'; //Hardcode this use case
				if (json_store.objects[nav_name].label !== undefined) nav_name = (json_store.objects[nav_name].label);

			}
			else {
				nav_link = json_store.collections[collection_keys_arr[i]].link;
				nav_name = json_store.collections[collection_keys_arr[i]].name;
			}
			nav_link = buildLink (nav_link, breadcrumb + collection_keys_arr[i]);
			breadcrumb += collection_keys_arr[i] + ",";
			if (i == (collection_keys_arr.length-1)){
				$('#nav').append('<li class="active">' + nav_name + '</a></li>');
				$('title').html("MisterHouse - " + nav_name);
			} 
			else {
				$('#nav').append('<li><a href="' + nav_link + '">' + nav_name + '</a></li>');
			}
		}
	}
}

function loadVars (){ //variables list
	var URLHash = URLToHash();
	$.ajax({
		type: "GET",
		url: "/json/"+HashtoJSONArgs(URLHash),
		dataType: "json",
		success: function( json ) {
			JSONStore(json);
			var list_output = "";
			var keys = [];
			for (var key in json.data) {
				keys.push(key);
			}
			keys.sort ();
			for (var i = 0; i < keys.length; i++){
				var value = variableList(json.data[keys[i]]);
				var name = keys[i];
				var list_html = "<ul><li><b>" + name + ":</b>" + value+"</li></ul>";
				list_output += (list_html);
			}
		
			//Print list output if exists;
			if (list_output !== ""){
				$('#list_content').html('');
				$('#list_content').append("<div id='buffer_vars' class='row top-buffer'>");
				$('#buffer_vars').append("<div id='row_vars' class='col-sm-12 col-sm-offset-0 col-md-10 col-md-offset-1 col-lg-8 col-lg-offset-2'>");
				$('#row_vars').append(list_output);
			}
		}
	});
}

//Recursively parses a JSON entity to print all variables 
function variableList(value){
	var retValue = '';
	if (typeof value == 'object' && value !== null) {
		var keys = [];
		for (var key in value) {
			keys.push(key);
		}
		keys.sort ();
		for (var i = 0; i < keys.length; i++){
			retValue += "<ul><li><b>" + keys[i] +":</b>"+ variableList(value[keys[i]]) + "</li></ul>";
		}
	} else {
		retValue = "<ul><li>" + value+"</li></ul>";
	}
	return retValue;
}

//Prints a JSON generated list of MH objects
var loadList = function() {
	var URLHash = URLToHash();
	if (getJSONDataByPath("objects") === undefined){
		// We need at least some basic info on all objects
		$.ajax({
			type: "GET",
			url: "/json/objects?fields=sort_order,members,label",
			dataType: "json",
			success: function( json ) {
				JSONStore(json);
				loadList();
			}
		});
		return;
	}
	var collection_key = URLHash._collection_key;
	var button_text = '';
	var button_html = '';
	var entity_arr = [];
	URLHash.fields = "category,label,sort_order,members,state,states,state_log,hidden,type,text";
	$.ajax({
		type: "GET",
		url: "/json/"+HashtoJSONArgs(URLHash),
		dataType: "json",
		success: function( json ) {
			//Save this to the JSON store
			JSONStore(json);
			
			// Catch Empty Responses
			if ($.isEmptyObject(json.data)) {
				entity_arr.push("No objects found");
			}

			// Build sorted list of objects
			var entity_list = [];
			for(var k in json.data) entity_list.push(k);
			var sort_list;
			if (URLHash.parents !== undefined && 
				json_store.objects[URLHash.parents] !== undefined &&
				json_store.objects[URLHash.parents].sort_order !== undefined) {
				sort_list = json_store.objects[URLHash.parents].sort_order;
			}
			
			// Set Options Modal Entity
			// "Parent" entity can be different depending on the manner in which
			// the list is requested, need to figure out a heirarchy at some point
			// Currently, we only handle groups, so we only deal with parent
			if (URLHash.parents !== undefined) {
				$("#toolButton").attr('entity', URLHash.parents);
			}			
			
			// Sort that list if a sort exists, probably exists a shorter way to
			// write the sort
//			if (sort_list !== undefined){
//				entity_list = sortArrayByArray(entity_list, sort_list);
//			}

			for (var i = 0; i < entity_list.length; i++) {
				var entity = entity_list[i];
				if (json_store.objects[entity].type === undefined){
					// This is not an entity, likely a value of the root obj
					continue;
				}
				if (json_store.objects[entity].hidden !== undefined){
					// This is an entity with the hidden property, so skip it
					continue;
				}
				if (json_store.objects[entity].type == "Voice_Cmd"){
					button_text = json_store.objects[entity].text;
					//Choose the first alternative of {} group
					while (button_text.indexOf('{') >= 0){
						var regex = /([^\{]*)\{([^,]*)[^\}]*\}(.*)/;
						button_text = button_text.replace(regex, "$1$2$3");
					}
					//Put each option in [] into toggle list, use first option by default
					if (button_text.indexOf('[') >= 0){
						var regex = /(.*)\[([^\]]*)\](.*)/;
						var options = button_text.replace(regex, "$2");
						var button_text_start = button_text.replace(regex, "$1");
						var button_text_end = button_text.replace(regex, "$3");
						options = options.split(',');
						button_html = '<div class="btn-group btn-block fillsplit">';
						button_html += '<div class="leadcontainer">';
						button_html += '<button type="button" class="btn btn-default dropdown-lead btn-lg btn-list btn-voice-cmd navbutton-padding">'+button_text_start + "<u>" + options[0] + "</u>" + button_text_end+'</button>';
						button_html += '</div>';
						button_html += '<button type="button" class="btn btn-default btn-lg dropdown-toggle pull-right btn-list-dropdown navbutton-padding" data-toggle="dropdown">';
						button_html += '<span class="caret"></span>';
						button_html += '<span class="sr-only">Toggle Dropdown</span>';
						button_html += '</button>';
						button_html += '<ul class="dropdown-menu dropdown-voice-cmd" role="menu">';
						for (var j=0,len=options.length; j<len; j++) { 
							button_html += '<li><a href="#">'+options[j]+'</a></li>';
						}
						button_html += '</ul>';
						button_html += '</div>';
					}
					else {
						button_html = "<div style='vertical-align:middle'><button type='button' class='btn btn-default btn-lg btn-block btn-list btn-voice-cmd navbutton-padding'>";
						button_html += "" +button_text+"</button></div>";
					}
					entity_arr.push(button_html);
				} //Voice Command Button
				else if(json_store.objects[entity].type == "Group" ||
					    json_store.objects[entity].type == "Type" ||
					    json_store.objects[entity].type == "Category"){
					//??json_store.objects[entity] = json_store.objects[entity];
					var object = json_store.objects[entity];
					button_text = entity;
					if (object.label !== undefined) button_text = object.label;
					//Put entities into button
					var filter_args = "parents="+entity;
					if (json_store.objects[entity].type == "Category"){
						filter_args = "type=Voice_Cmd&category="+entity;
					}
					else if (json_store.objects[entity].type == "Type") {
						filter_args = "type="+entity;
					}
					var dbl_btn = "";
					if (json_store.ia7_config.prefs.always_double_buttons == "yes") {
						if (entity.length < 30) dbl_btn = "<br><br>"; 
					}
					button_html = "<div style='vertical-align:middle'><a role='button' listType='objects'";
					button_html += "class='btn btn-default btn-lg btn-block btn-list btn-division navbutton-padding'";
					button_html += "href='#path=/objects&"+filter_args+"&_collection_key="+collection_key+",$" + entity + "' >";
					button_html += "" +button_text + dbl_btn +"</a></div>";
					entity_arr.push(button_html);
					continue;
				}
				else {
					// These are controllable MH objects
					json_store.objects[entity] = json_store.objects[entity];
					var name = entity;
					var color = getButtonColor(json_store.objects[entity].state);
					if (json_store.objects[entity].label !== undefined) name = json_store.objects[entity].label;
					//Put objects into button
					var dbl_btn = "";
					if (json_store.ia7_config.prefs.always_double_buttons == "yes") {
						if (name.length < 30) dbl_btn = "<br>"; 
			//			if (json_store.objects[entity].state == undefined) dbl_btn += "<br>";
					}
					// direct control item, differentiate the button
					var btn_direct = "";
					if (json_store.ia7_config.objects !== undefined && json_store.ia7_config.objects[entity] !== undefined) {
                		if (json_store.ia7_config.objects[entity].direct_control !== undefined && json_store.ia7_config.objects[entity].direct_control == "yes") {
                            btn_direct = "btn-direct";
                		}
                	} 
					button_html = "<div style='vertical-align:middle'><button entity='"+entity+"' ";
					button_html += "class='btn btn-"+color+" btn-lg btn-block btn-list btn-popover "+btn_direct+" btn-state-cmd navbutton-padding'>";
					button_html += name+dbl_btn+"<span class='pull-right'>"+json_store.objects[entity].state+"</span></button></div>";
					entity_arr.push(button_html);
				}
			}//entity each loop
			
			//loop through array and print buttons
			var row = 0;
			var column = 1;
			for (var i = 0; i < entity_arr.length; i++){
				if (i === 0) {
					$('#list_content').html('');
				}
				if (column == 1){
					$('#list_content').append("<div id='buffer"+row+"' class='row top-buffer'>");
					$('#buffer'+row).append("<div id='row" + row + "' class='col-sm-12 col-sm-offset-0 col-md-10 col-md-offset-1 col-lg-8 col-lg-offset-2'>");
				}
				$('#row'+row).append("<div class='col-sm-4'>" + entity_arr[i] + "</div>");
				if (column == 3){
					column = 0;
					row++;
				}
				column++;
			}
			
			//Affix functions to all button clicks
			$(".dropdown-voice-cmd > li > a").click( function (e) {
				var button_group = $(this).parents('.btn-group');
				button_group.find('.leadcontainer > .dropdown-lead >u').html($(this).text());
				e.preventDefault();
			});
			$(".btn-voice-cmd").click( function () {
				var voice_cmd = $(this).text().replace(/ /g, "_");
				var url = '/RUN;last_response?select_cmd=' + voice_cmd;
				$.get( url, function(data) {
					var start = data.toLowerCase().indexOf('<body>') + 6;
					var end = data.toLowerCase().indexOf('</body>');
					$('#lastResponse').find('.modal-body').html(data.substring(start, end));
					$('#lastResponse').modal({
						show: true
					});
				});
			});
			$(".btn-state-cmd").click( function () {
				var entity = $(this).attr("entity");
				if (json_store.ia7_config.objects !== undefined && json_store.ia7_config.objects[entity] !== undefined) {
                	if (json_store.ia7_config.objects[entity].direct_control !== undefined && json_store.ia7_config.objects[entity].direct_control == "yes") {
                         //console.log("This is a direct control object "+entity+" state="+json_store.objects[entity].state+" length="+json_store.objects[entity].states.length);
                         var new_state = "";
                         var possible_states = 0;
                         for (var i = 0; i < json_store.objects[entity].states.length; i++){
                         	if (filterSubstate(json_store.objects[entity].states[i]) == 1) continue;
                         	//console.log("state "+i+" is "+json_store.objects[entity].states[i])
                         	possible_states++;
                         	if (json_store.objects[entity].states[i] !== json_store.objects[entity].state) new_state = json_store.objects[entity].states[i];

                         	}
                        //console.log("End states = "+i+" new_state="+new_state)
						if ((possible_states > 2) || (new_state == "")) alert("Check configuration of "+entity+". "+possible_states+" states detected for direct control object. State is "+new_state);
						url= '/SET;none?select_item='+entity+'&select_state='+new_state;
						$.get( url);
                	} else {
                		create_state_modal(entity);
                	}
				} else {				
					create_state_modal(entity);
				}
			});
			$(".btn-state-cmd").mayTriggerLongClicks().on( 'longClick', function() {		
				var entity = $(this).attr("entity");
				create_state_modal(entity);
			});			
			
		}
	});
	// Continuously check for updates if this was a group type request
	updateList(URLHash.path);

};//loadlistfunction

var getButtonColor = function (state) {
	var color = "default";
	if (state == "on" || state == "open" || state == "disarmed" || state == "unarmed" || state == "ready" || state == "dry" || state == "up" || state == "100%" || state == "online") {
		 color = "success";
	} else if (state == "motion" || state == "closed" || state == "armed" || state == "wet" || state == "fault" || state == "down" || state == "offline") {
		 color = "danger";
	} else if (state == undefined || state == "unknown" ) {
		 color = "info";
	} else if (state == "low" || state == "med" || state.indexOf('%') >= 0 || state == "light") { 
		 color = "warning";
	}
	return color;
};

var filterSubstate = function (state) {
 	// ideally the gear icon on the set page will remove the filter
    var filter = 0
    // remove 11,12,13... all the mod 10 states
    if (state.indexOf('%') >= 0) {
    
       var number = parseInt(state, 10)
       if (number % json_store.ia7_config.prefs.substate_percentages != 0) {
         filter = 1
        }
    }
    
    if (state == "manual" ||
    	state == "double on" ||
    	state == "double off" ||
    	state == "triple on" ||
    	state == "triple off" ||
    	state == "status on" ||
    	state == "status off" ||
    	state == "status on" ||
    	state == "clear" ||
    	state == "setramprate" ||
    	state == "setonlevel" ||
    	state == "addscenemembership" ||
    	state == "setsceneramprate" ||
    	state == "deletescenemembership" ||
    	state == "disablex10transmit" ||
    	state == "enablex10transmit" ||
    	state == "set ramp rate" ||
    	state == "set on level" ||
    	state == "add to scene" ||
    	state == "remove from scene" ||
    	state == "set scene ramp rate" ||
    	state == "disable transmit" ||
    	state == "enable transmit" ||
    	state == "disable programming" ||
    	state == "enable programming" ||
    	state == "0%" ||
    	state == "100%" ||
    	state == "error" ||
        state == "status" ) {
        filter = 1
    }
    
    return filter;
};
        


var sortArrayByArray = function (listArray, sortArray){
	listArray.sort(function(a,b) {
		if (sortArray.indexOf(a) < 0) {
			return 1;
		}
		else if (sortArray.indexOf(b) < 0) {
			return -1;
		}
		else {
			return sortArray.indexOf(a) - sortArray.indexOf(b);
		}
	});
	return listArray;
};

//Used to dynamically update the state of objects
var updateList = function(path) {
	var URLHash = URLToHash();
	URLHash.fields = "state,state_log,type";
	URLHash.long_poll = 'true';
	URLHash.time = json_store.meta.time;
	if (updateSocket !== undefined && updateSocket.readyState != 4){
		// Only allow one update thread to run at once
		updateSocket.abort();
	}
	var split_path = HashtoJSONArgs(URLHash).split("?");
	var path_str = split_path[0];
	var arg_str = split_path[1];
	updateSocket = $.ajax({
		type: "GET",
		url: "/LONG_POLL?json('GET','"+path_str+"','"+arg_str+"')",
		dataType: "json",
		success: function( json, textStatus, jqXHR) {
			if (jqXHR.status == 200) {
				JSONStore(json);
				for (var entity in json.data){
					if (json.data[entity].type === undefined){
						// This is not an entity, skip it
						continue;
					}
					var color = getButtonColor(json.data[entity].state);
					$('button[entity="'+entity+'"]').find('.pull-right').text(
						json.data[entity].state);
					$('button[entity="'+entity+'"]').removeClass("btn-default");
					$('button[entity="'+entity+'"]').removeClass("btn-success");
					$('button[entity="'+entity+'"]').removeClass("btn-warning");
					$('button[entity="'+entity+'"]').removeClass("btn-danger");
					$('button[entity="'+entity+'"]').removeClass("btn-info");
					$('button[entity="'+entity+'"]').addClass("btn-"+color);
					
				}
			}
			if (jqXHR.status == 200 || jqXHR.status == 204) {
				//Call update again, if page is still here
				//KRK best way to handle this is likely to check the URL hash
				if (URLHash.path == path){
					//While we don't anticipate handling a list of groups, this 
					//may error out if a list was used
					updateList(path);
				}
			}
		}, // End success
	});  //ajax request
};//loadlistfunction

var updateItem = function(item,link,time) {
	var URLHash = URLToHash();
	URLHash.fields = "state";
	URLHash.long_poll = 'true';
	//URLHash.time = json_store.meta.time;
	if (updateSocket !== undefined && updateSocket.readyState != 4){
		// Only allow one update thread to run at once
		updateSocket.abort();
	}
	if (time === undefined) {
		time = "";
	}
	var path_str = "/objects"  // override, for now, would be good to add voice_cmds
	//arg_str=link=%2Fia7%2Fhouse%2Fgarage.shtml&fields=state%2Ctype&long_poll=true&time=1426011733833.94
	//arg_str = "fields=state,states,label&long_poll=true&time="+time;
	var arg_str = "fields=state,states,label,state_log&long_poll=true&items="+item+"&time="+time;
	//alert("path_str="+path_str+" arg_str="+arg_str)
	updateSocket = $.ajax({
		type: "GET",
		url: "/LONG_POLL?json('GET','"+path_str+"','"+arg_str+"')",
		dataType: "json",
		success: function( json, textStatus, jqXHR) {
			var requestTime = time;
			if (jqXHR.status == 200) {
				JSONStore(json);
				requestTime = json_store.meta.time;
				var color = getButtonColor(json.data[item].state);
				$('button[entity="'+item+'"]').find('.pull-right').text(
					json.data[item].state);
				$('button[entity="'+item+'"]').removeClass("btn-default");
				$('button[entity="'+item+'"]').removeClass("btn-success");
				$('button[entity="'+item+'"]').removeClass("btn-warning");
				$('button[entity="'+item+'"]').removeClass("btn-danger");
				$('button[entity="'+item+'"]').removeClass("btn-info");
				$('button[entity="'+item+'"]').addClass("btn-"+color);
			}
			if (jqXHR.status == 200 || jqXHR.status == 204) {

				if (URLHash.link == link || link == undefined){
//					//While we don't anticipate handling a list of groups, this 
//					//may error out if a list was used
					//testingObj(json_store.meta.time);
				updateItem(item,URLHash.link,requestTime);
				}
			}
		}, // End success
	});  //ajax request
}

var updateStaticPage = function(link,time) {
// Loop through objects and get entity name
// update entity based on mh module.
	var entity;
	var states_loaded = 0;
	if (link != undefined) {
  		states_loaded = 1;
	}
	var items = '';
    $('button[entity]').each(function(index) {
        if (index != 0) { //TODO really kludgy
          items += $(this).attr('entity')+",";
   		 }
   	})
	var URLHash = URLToHash();
	URLHash.fields = "state,states,state_log,label,type";
	URLHash.long_poll = 'true';
	URLHash.time = json_store.meta.time;
	if (updateSocket !== undefined && updateSocket.readyState != 4){
		// Only allow one update thread to run at once
		updateSocket.abort();
	}

	var path_str = "/objects"  // override, for now, would be good to add voice_cmds
	var arg_str = "fields=state%2Cstates%2Cstate_log%2Clabel&long_poll=true&items="+items+"&time="+time;

	updateSocket = $.ajax({
		type: "GET",
		url: "/LONG_POLL?json('GET','"+path_str+"','"+arg_str+"')",
		dataType: "json",
		success: function( json, textStatus, jqXHR) {
			var requestTime = time;
			if (jqXHR.status == 200) {
				JSONStore(json);
				requestTime = json_store.meta.time;
				$('button[entity]').each(function(index) {
					if ($(this).attr('entity') != '' && json.data[$(this).attr('entity')] != undefined ) { //need an entity item for this to work.
						entity = $(this).attr('entity');
						//alert ("entity="+entity+" this="+$(this).attr('entity'));
						//alert ("state "+json.data[entity].state)
						var color = getButtonColor(json.data[entity].state);
						$('button[entity="'+entity+'"]').find('.pull-right').text(json.data[entity].state);
						$('button[entity="'+entity+'"]').removeClass("btn-default");
						$('button[entity="'+entity+'"]').removeClass("btn-success");
						$('button[entity="'+entity+'"]').removeClass("btn-warning");
						$('button[entity="'+entity+'"]').removeClass("btn-danger");
						$('button[entity="'+entity+'"]').removeClass("btn-info");
						$('button[entity="'+entity+'"]').addClass("btn-"+color);
				
						//don't run this if stategrp0 exists	
						if (states_loaded == 0) {
			                $(".btn-state-cmd").click( function () {
                                var entity = $(this).attr("entity");			
								create_state_modal(entity);
							});
						}																
					}			
				});
			}
			if (jqXHR.status == 200 || jqXHR.status == 204) {
				//Call update again, if page is still here
				//KRK best way to handle this is likely to check the URL hash
				if (URLHash.link == link || link == undefined){
					//While we don't anticipate handling a list of groups, this 
					//may error out if a list was used
					updateStaticPage(URLHash.link,requestTime);
				}
			}
		}, 
	});  
}

	
//Prints all of the navigation items for Ia7
var loadCollection = function(collection_keys) {
	if (collection_keys === undefined) collection_keys = '0';
	var collection_keys_arr = collection_keys.split(",");
	var last_collection_key = collection_keys_arr[collection_keys_arr.length-1];
	var entity_arr = [];
	var items = "";
	var entity_sort = json_store.collections[last_collection_key].children;
	if (entity_sort.length <= 0){
		entity_arr.push("Childless Collection");
	}
	for (var i = 0; i < entity_sort.length; i++){
		var collection = entity_sort[i];
		if (!(collection in json_store.collections)) continue;
		var link = json_store.collections[collection].link;
		var icon = json_store.collections[collection].icon;
		var name = json_store.collections[collection].name;
		var mode = json_store.collections[collection].mode;
		var keys = json_store.collections[collection].keys; //for legacy CGI scripts to recreate proper URL
		var item = json_store.collections[collection].item;
		
		if (item !== undefined) {
			if (json_store.objects[item] === undefined) {
				var path_str = "/objects";
				var arg_str = "fields=state,states,label,state_log&items="+item;
				$.ajax({
					type: "GET",
					url: "/json"+path_str+"?"+arg_str,
					dataType: "json",
					success: function( json ) {
						JSONStore(json);
						loadCollection(collection_keys);
						}
				});
			} else {
				var name = item;
				var color = getButtonColor(json_store.objects[item].state);
				if (json_store.objects[item].label !== undefined) name = json_store.objects[item].label;
				var dbl_btn = "";
				if (name.length < 30) dbl_btn = "<br>"; 
				var button_html = "<div style='vertical-align:middle'><button entity='"+item+"' ";
				button_html += "class='btn btn-"+color+" btn-lg btn-block btn-list btn-popover btn-state-cmd navbutton-padding'>";
				button_html += name+dbl_btn+"<span class='pull-right'>"+json_store.objects[item].state+"</span></button></div>";
				entity_arr.push(button_html);
				items += item+",";		
			}
		
		} else {		
			if (json_store.collections[collection].iframe !== undefined) {
				link = "/ia7/include/iframe.shtml?"+json_store.collections[collection].iframe;
			}
			var hidden = "";
			if (mode != display_mode && mode != undefined ) hidden = "hidden"; //Hide any simple/advanced buttons
			var next_collection_keys = collection_keys + "," + entity_sort[i];
			if (keys === "true") {
				var arg = "?";
				if (link.indexOf("?") >= 0 ) { //already has arguments, so just add one on
					arg = "&";
				}
				link += arg+"ia7="+next_collection_keys;
			}		
			link = buildLink (link, next_collection_keys);
			if (json_store.collections[collection].external !== undefined) {
				link = json_store.collections[collection].external;
			}
			var icon_set = "fa";
			if (icon.indexOf("wi-") !=-1) icon_set = "wi";
			var button_html = "<a link-type='collection' href='"+link+"' class='btn btn-default btn-lg btn-block btn-list "+hidden+" navbutton-padding' role='button'><i class='"+icon_set+" "+icon+" icon-larger fa-2x fa-fw'></i>"+name+"</a>";
			entity_arr.push(button_html);
		}
	}
	//loop through array and print buttons
	var row = 0;
	var column = 1;
	for (var i = 0; i < entity_arr.length; i++){
		if (column == 1){
            if (row === 0){
                $('#list_content').html('');
            }
			$('#list_content').append("<div id='buffer"+row+"' class='row top-buffer'>");
			$('#buffer'+row).append("<div id='row" + row + "' class='col-sm-12 col-sm-offset-0 col-md-10 col-md-offset-1 col-lg-8 col-lg-offset-2'>");
		}
		$('#row'+row).append("<div class='col-sm-4'>" + entity_arr[i] + "</div>");
		if (column == 3){
			column = 0;
			row++;
		}
		column++;
	}
	// if any items present, then create modals and activate updateItem...
	if (items !== "") {
		items = items.slice(0,-1); //remove last comma
		//console.log("items="+items);
		$('.btn-state-cmd').click( function () {			
			var entity = $(this).attr("entity");
			//console.log("entity="+entity);
			create_state_modal(entity);
		});
// test multiple items at some point
		updateItem(items);
	}	
	
};

//Constructs a link, likely should be replaced by HashToURL
function buildLink (link, collection_keys){
	if (link === undefined) {
		link = "#";
	} 
	else if (link.indexOf("#") === -1){
		link = "#_request=page&link="+link+"&";
	}
	else {
		link += "&";
	}
	link += "_collection_key="+ collection_keys;
	return link;
}

//Outputs a constantly updating print log
var print_log = function(type,time) {

	var URLHash = URLToHash();
	if (typeof time === 'undefined'){
		$('#list_content').html("<div id='print_log' class='row top-buffer'>");
		$('#print_log').append("<div id='row_log' class='col-sm-12 col-sm-offset-0 col-md-10 col-md-offset-1 col-lg-8 col-lg-offset-2'>");
		$('#row_log').append("<ul id='list'></ul>");
		time = 0;
	}
	URLHash.time = time;
	URLHash.long_poll = 'true';
	if (updateSocket !== undefined && updateSocket.readyState != 4){
		// Only allow one update thread to run at once
		updateSocket.abort();
	}
	var split_path = HashtoJSONArgs(URLHash).split("?");
	var path_str = split_path[0];
	if (type == "speak") path_str = "/print_speaklog";
	var arg_str = split_path[1];	
	updateSocket = $.ajax({
		type: "GET",
		url: "/LONG_POLL?json('GET','"+path_str+"','"+arg_str+"')",
		dataType: "json",
		success: function( json, statusText, jqXHR ) {
			var requestTime = time;
			if (jqXHR.status == 200) {
				JSONStore(json);
				for (var i = (json.data.length-1); i >= 0; i--){
					var line = String(json.data[i]);
					line = line.replace(/\n/g,"<br>");
					if (line) $('#list').prepend("<li style='font-family:courier, monospace;white-space:pre-wrap;font-size:small;position:relative;'>"+line+"</li>");
				}
				requestTime = json.meta.time;
			}
			if (jqXHR.status == 200 || jqXHR.status == 204) {
				//Call update again, if page is still here
				//KRK best way to handle this is likely to check the URL hash
				if ($('#row_log').length !== 0){
					//If the print log page is still active request more data
					print_log(type,requestTime);
				}
			}		
		}
	});
};


//Creates a table based on the $json_table data structure. desktop & mobile design
var display_table = function(table,records,time) {

	var URLHash = URLToHash();
	if (typeof time === 'undefined'){
		$('#list_content').html("<div id='display_table' class='row top-buffer'>");
		$('#display_table').append("<div id='rtable' class='col-sm-12 col-sm-offset-0 col-md-10 col-md-offset-1 col-lg-8 col-lg-offset-2 col-xs-11 col-xs-offset-0'>");
		time = 0;
	}
	URLHash.time = time;
	URLHash.long_poll = 'true';
	if (updateSocket !== undefined && updateSocket.readyState != 4){
		// Only allow one update thread to run at once
		updateSocket.abort();
	}	
	var path_str = "/table_data"  
	var arg_records = "";
	var page_size;
	if (records !== undefined) arg_records = "&records="+records;
	var arg_str = "var="+table+arg_records+"&start=0&long_poll=true&time="+time;
	updateSocket = $.ajax({
		type: "GET",
		url: "/LONG_POLL?json('GET','"+path_str+"','"+arg_str+"')",
		dataType: "json",
		success: function( json, statusText, jqXHR ) {
			var requestTime = time;
			if (jqXHR.status == 200) {
				JSONStore(json);
				// HP should probably use jquery, but couldn't get sequencing right.
				// HP jquery would allow selected values to be replaced in the future.
				var html = "<table class='table table-curved'><thead><tr>";
				for (var i = 0; i < json.data.head.length; i++){
					var head = String(json.data.head[i]);
					html += "<th>"+head+"</th>";
				}
				html += "</tr></thead><tbody>";
				if (json.data.data !== undefined) {  //If no data, at least show the header
					for (var i = 0; i < json.data.data.length; i++){
						page_size = json.data.page_size + (json.data.page_size * json.data.page);
						if (json.data.page !== undefined && page_size < i &&
						    json_store.ia7_config.prefs.enable_data_table_more !== undefined && 
					        json_store.ia7_config.prefs.enable_data_table_more === "yes") {
							continue;
						}
						html +="<tr>";
						for (var j = 0; j < json.data.data[i].length; j++){
					   		var line = String(json.data.data[i][j]);
					  		html += "<td data-title='"+json.data.head[j]+"'>"+line+"</td>";
							}
						html += "</tr>";
					}
				}
				html += "</tbody></table></div>";
				requestTime = json.meta.time;
				$('#rtable').html(html);
				if (json_store.ia7_config.prefs.enable_data_table_more !== undefined && json_store.ia7_config.prefs.enable_data_table_more === "yes") {
					if (json.data.hook !== undefined && $('#more_row').length === 0) { //there is an option to pull more data
						//console.log("More Data!"+$('#more_row').length);
						$('#display_table').append("<div id='more_row' class='col-sm-12 col-sm-offset-0 col-md-10 col-md-offset-1 col-lg-8 col-lg-offset-2 col-xs-11 col-xs-offset-0'>");
						$('#more_row').append('<div class="table_more"><button class="btn btn-default toolbar-right-end right-end pull-right table_btn_more" type="button">');
						$('.table_btn_more').append('next  <i class="fa fa-caret-right"></i>');
					
						$('.table_btn_more').click('on', function () {
							var new_page_size = json.data.page_size + (json.data.page_size * (json.data.page + 1));
							display_table(table,new_page_size,requestTime);
						});
					}
				}

			}
			if (jqXHR.status == 200 || jqXHR.status == 204) {
				//Call update again, if page is still here
				//KRK best way to handle this is likely to check the URL hash
				if ($('#display_table').length !== 0){
					//If the display table page is still active request more data
					display_table(table,page_size,requestTime);
				}
			}		
		}
	});
};


//Creates a table based on the $json_table data structure. desktop & mobile design
var graph_rrd = function(start,group,time) {

	var URLHash = URLToHash();
	if (typeof time === 'undefined'){
		$('#list_content').html("<div id='top-graph' class='row top-buffer'>");
		$('#top-graph').append("<div id='rrd-periods' class='row'>");
		$('#top-graph').append("<div id='rrd-graph' class='col-sm-12 col-sm-offset-0 col-md-10 col-md-offset-1 col-lg-8 col-lg-offset-2 col-xs-11 col-xs-offset-0'>");
		$('#top-graph').append("<div id='rrd-legend' class='rrd-legend-class'><br>");
	//	$('#top-graph').append("<div id='legend class='col-sm-12 col-sm-offset-0 col-md-10 col-md-offset-1 col-lg-8 col-lg-offset-2 col-xs-11 col-xs-offset-0'><br><br>");

		time = 0;
	}
		
	URLHash.time = time;
	URLHash.long_poll = 'true';
	if (updateSocket !== undefined && updateSocket.readyState != 4){
		// Only allow one update thread to run at once
		updateSocket.abort();
	}	
	var path_str = "/rrd"  
	var arg_str = "start="+start+"&group="+group+"&long_poll=true&time="+time;
	updateSocket = $.ajax({
		type: "GET",
		url: "/LONG_POLL?json('GET','"+path_str+"','"+arg_str+"')",
		dataType: "json",
		success: function( json, statusText, jqXHR ) {
			var requestTime = time;
			if (jqXHR.status == 200) {
				JSONStore(json);
				// HP should probably use jquery, but couldn't get sequencing right.
				// HP jquery would allow selected values to be replaced in the future.

				if (json.data.data !== undefined) {  //If no data, at least show the header and an error
//TODO
				}	
				var dropdown_html = '<div class="dropdown"><button class="btn btn-default rrd-period-dropdown" data-target="#" type="button" data-toggle="dropdown">';
				var dropdown_html_list = "";
				var dropdown_current = "Unknown  ";

				$.each(json.data.periods, function(key, value) {
    				//console.log(key, value);
    				if (start === value.split(",")[1]) {
    					dropdown_current = value.split(",")[0]+"  ";
    				} else {
    					dropdown_html_list += '<li><a href="javascript: void(0)" id="rrdperiod_'+key+'" ';
    					//dropdown_html_list += 'onclick=graph_rrd('+value.split(",")[1]+','+group+','+time+');';
    					dropdown_html_list += '>'+value.split(",")[0]+'</a></li>';
 
    				}
				});
				dropdown_html += dropdown_current+'<span class="caret"></span></button><ul class="dropdown-menu">';
				dropdown_html += dropdown_html_list;
				dropdown_html += '</ul></div>';
				
				$('#rrd-periods').append(dropdown_html);

				$('.dropdown').on('click', '.dropdown-menu li a', function(e){
					e.stopPropagation();
    				var period = $(this).attr("id").match(/rrdperiod_(.*)/)[1]; 
    				var new_start = json.data.periods[period].split(',')[1];
					$('.open').removeClass('open');
					graph_rrd(new_start,group);
				});

				//sort the legend
				json.data.data.sort(function(a, b){
    				if(a.label < b.label) return -1;
    				if(a.label > b.label) return 1;
    				return 0;
				})

					// put the selection list on the side.
				for (var i = 0; i < json.data.data.length; i++){
					//console.log("selection="+json.data.data[i].label);
					var legli = $('<li style="list-style:none;"/>').appendTo('#rrd-legend');
					$('<input name="' + json.data.data[i].label + '" id="' + json.data.data[i].label + '" type="checkbox" checked="checked" />').appendTo(legli);
					$('<label>', {
						class: "rrd-legend-class",
						text: json.data.data[i].label,
				    	'for': json.data.data[i].label
						}).appendTo(legli);
				}
 
				function plotAccordingToChoices() {
    				var data = [];

    				$('#rrd-legend').find("input:checked").each(function() {
        				var key = this.name;
        				for (var i = 0; i < json.data.data.length; i++) {
            				if (json.data.data[i].label === key) {
                			data.push(json.data.data[i]);
                			return true;
           		 			}
       		 			}
    				});
    				$.plot($("#rrd-graph"), data, json.data.options);
    				$('.legend').hide();	
				}
		
				window.onresize = function(){
    				var base_width = $(window).width();
   					if (base_width > 990) base_width = 990;
   					var graph_width = base_width - 200; //give some room for the legend
					if (base_width < 701) {
						//put legend below graph
						graph_width=base_width; // - 10;
					} 
    				$('#rrd-graph').css("width",graph_width+"px");
    				//console.log("base="+base_width+" graph="+graph_width);
    				$('#rrd-graph').text(''); 
    				$('#rrd-graph').show(); //check
    				plotAccordingToChoices();

				}

				var previousPoint = null;

				$("#rrd-graph").bind("plothover", function(event, pos, item) {
    				$("#x").text(pos.x.toFixed(2));
    				$("#y").text(pos.y.toFixed(2));
    				if (item) {
        				if (previousPoint != item.datapoint) {
            			previousPoint = item.datapoint;
            			$("#tooltip").remove();
            			var x = item.datapoint[0].toFixed(2),
                		y = item.datapoint[1].toFixed(2);
						var date = new Date(parseInt(x));
						var date_str = date.toString(); //split("GMT")[0];
						var nice_date = date_str.split(" GMT")[0];
            			showTooltip(item.pageX, item.pageY, item.series.label + " " + y + "<br>" + nice_date);
        				}
    				} else {
        				$("#tooltip").remove();
        				previousPoint = null;
    				}
				});

				function showTooltip(x, y, contents) {
    				$('<div id="tooltip">' + contents + '</div>').css({
        				position: 'absolute',
        				display: 'none',
        				top: y + 5,
        				left: x + 15,
        				border: '1px solid #fdd',
        				padding: '2px',
        				backgroundColor: '#fee',
        				opacity: 0.80
    				}).appendTo("body").fadeIn(200);
				}

				window.onresize(); // get all settings based on current window size
				plotAccordingToChoices();

				$('#rrd-legend').find("input").change(plotAccordingToChoices);		

				$('.legendColorBox > div > div').each(function(i){
					var color = $(this).css("border-left-color");
					//console.log("color="+color);
    				//$(this).clone().prependTo($('#rrd-legend').find("li").eq(i));
    				$('#rrd-legend').find("li").eq(i).prepend('<span style="width:4px;height:4px;border: 0px;background: '+color+';">&nbsp;&nbsp;&nbsp;</span>&nbsp');
					});
				requestTime = json.meta.time;

			}
			if (jqXHR.status == 200 || jqXHR.status == 204) {
				//Call update again, if page is still here
				//KRK best way to handle this is likely to check the URL hash
				if ($('#top-graph').length !== 0){
//TODO live updates
					//If the graph  page is still active request more data
//					graph_rrd(start,group,requestTime);
				}
			}		
		}
	});
};

/////////////// Floorplan //////////////////////////////////////////////////////////
var fp_display_width=0; // updated by fp_resize_floorplan_image
var fp_display_height=0; // updated by fp_resize_floorplan_image
var fp_scale = 100; // updated by fp_reposition_entities
var fp_grabbed_entity = null; // store item for drag & drop
var fp_icon_select_item_id = null; // store item id on right click for icon set selection

var noDragDrop = function() {
    return false;
};

var fp_getOrCreateIcon = function (json, entity, i, coords, show_pos){
    var popover = 0;
    if ((json.data[entity].type === "FPCamera_Item") || (json_store.ia7_config.prefs.fp_state_popovers === "yes"))
        popover = 1;

    var popover_html = "";
    if (popover)
        popover_html = 'data-toggle="popover" data-trigger="focus" tabindex="0"';

    var entityId = 'entity_'+entity+'_'+i;
    if ($('#' + entityId).length === 0) {
        var html = '<span style="display: inline-block">'  + // this span somehow magically make resizing the icons work
                '<a title="'+entity+'"><img '+popover_html+' ' +
                'id="'+entityId+'"' +
                'class="entity='+entityId+' floorplan_item coords='+coords+'" '+
                '"></img></a>'+
                '</span>';
        if (coords !== ""){
            $('#graphic').append(html);
        }
        else {
            $('#fp_positionless_items').append(html);
        }
    }
    var E = $('#'+entityId);
    E.bind("dragstart", noDragDrop);
    var image = get_fp_image(json.data[entity]);
    E.attr('src',"/ia7/graphics/"+image);
    if (show_pos)
        E.css("border","1px solid black");

    return E;
};

var fp_resize_floorplan_image = function(){
    var floor_width = $("#fp_graphic").width();
    $("#fp_graphic").attr("width", "1px");

    fp_display_width = $("#graphic").width();
    console.log("FP: resize "+ floor_width + " => " + fp_display_width);
    $('#fp_graphic').attr("width",fp_display_width+"px");
    fp_display_height = $("#fp_graphic").height();
};

var fp_reposition_entities = function(){
    var t0 = performance.now();
    var offset = $("#fp_graphic").offset();
    var width = fp_display_width;
    var hight = fp_display_height;
    var onePercentWidthInPx = width/100;
    var onePercentHeightInPx = hight/100;
    var fp_get_offset_from_location = function(item) {
        var y = item[0];
        var x = item[1];
        var newy = offset.top +  y * onePercentHeightInPx;
        var newx = offset.left +  x * onePercentWidthInPx;
        return {
            "top": newy,
            "left": newx
        };
    };
    var nwidth = $("#fp_graphic").get(0).naturalWidth;
    fp_scale = Math.round( width/nwidth * 100);

    // update the location of all the objects...
    $(".floorplan_item").each(function(index) {
        var classstr = $(this).attr("class");
        var coords = classstr.split(/coords=/)[1];
        $(this).width(fp_scale + "%");

        if (coords.length === 0){
            return;
        }
        var fp_location = coords.split(/x/);
        var fp_offset =  fp_get_offset_from_location(fp_location);

        // this seems to make the repositioning slow
        // ~ 300+ms on my nexus7 firefox-beta vs <100ms with this code commented out
        // var baseimg_width = $("#fp_graphic").width();
        // if (baseimg_width < 500) {
        //     $(this).attr('src',$(this).attr('src').replace('48.png','32.png'));
        // } else {
        //     $(this).attr('src',$(this).attr('src').replace('32.png','48.png'));
        // }

        var adjust = $(this).width()/2;
        var fp_off_center = {
            "top":  fp_offset.top - adjust,
            "left": fp_offset.left - adjust
        };
        fp_set_pos($(this).attr('id'), fp_off_center);
    });

	$('.icon_select img').each(function(){
        $(this).width(fp_scale + "%");
	});
    var t1 = performance.now();
    console.log("FP: reposition and scale: " +Math.round(t1 - t0) + "ms ");
};

var fp_set_pos = function(id, offset){
    var item =  $('#' + id);
    // do not move the span, this make the popup to narrow somehow
    // item.closest("span").offset(offset); 
    item.offset(offset);
};

var fp_is_point_on_fp = function (p){
    var offset = $("#fp_graphic").offset();
    var width = $("#fp_graphic").width();
    var height = $("#fp_graphic").height();
    if (p.top < offset.top) 
        return false;
    if (p.top > offset.top + height) 
        return false;
    if (p.left < offset.left)
        return false;
    if (p.left > offset.left + width)
        return false;

    return true;
};

var floorplan = function(group,time) {
    var URLHash = URLToHash();
    var baseimg_width;
    if (typeof time === 'undefined'){
        //var window_width = $(window).width();
        $('#list_content').html("<div id='floorplan' class='row top-buffer'>");
        if (URLHash.show_pos){
            // add elememnts to show current position on floorplan
            $('#floorplan').append("<div class='col-sm-12 col-sm-offset-0 col-md-10 col-md-offset-1 col-lg-8 col-lg-offset-2'><ol>" +
                    "<li>grab icon and drop it on apropriate position on the flooplan</li>" +
                    "<li>right click item to select another iconset</li>"+
                    "<li>to remove the item from the perl code drop it besides the fp background image</li>"+
                    "<li>repeat 1/2/3 for all items you'd like to change</li>"+
                    "<li>copy the generated perl code into your usercode file</li>" +
                    "</ol>" +
                    "<center>y,x = <span id='debug_pos'></span>" +
                    "</center></div>");
        }
        $('#floorplan').append("<div id='graphic' class='col-sm-12 col-sm-offset-0 col-md-10 col-md-offset-1 col-lg-8 col-lg-offset-2'>");
        time = 0;
        $('#graphic').prepend('<center><img id="fp_graphic" border="1"  /></center>');
        if (URLHash.show_pos){
            $('#fp_graphic').css("border","1px solid black");
            $('#list_content').append("<div id='fp_positionless_items' />");
            $('#list_content').append("<pre id='fp_pos_perl_code' />");
        }
        $('#fp_graphic').bind("load", function () {
            console.log("FP: background loaded.");
            fp_resize_floorplan_image();
            floorplan(group, time);
        });
        $('#fp_graphic').attr("src", '/ia7/graphics/floorplan-'+group+'.png');
        return;
    }

    if (updateSocket !== undefined && updateSocket.readyState !== 4){
        // Only allow one update thread to run at once
        updateSocket.abort();
    }

    if (URLHash.show_pos){
        // update positon

        $(document).mousemove(function(e){
            var offset = $("#fp_graphic").offset();
            var width = $("#fp_graphic").width();
            var hight = $("#fp_graphic").height();
            var  l = e.pageX - offset.left;
            var  t = e.pageY - offset.top;

            //var pos =   Math.round((t/hight) *100) +"," + Math.round((l/width)*100);
            var pos =  (t/hight) *100 +"," + (l/width)*100;
            //console.log("floorplanpos: " + pos );
            $('#debug_pos').text(pos);
            if (fp_grabbed_entity !== null){
                //var itemCenterOffset = Math.round(fp_grabbed_entity.width/2);
                var itemCenterOffset = fp_grabbed_entity.width/2;
                var newPos = {
                    "top": e.pageY - itemCenterOffset,
                    "left": e.pageX - itemCenterOffset
                };
                fp_set_pos(fp_grabbed_entity.id, newPos);
                //console.log(fp_grabbed_entity.id +" pos: " +newPos.top + " x " + newPos.left);
                //fp_grabbed_entity.class.replace("coords=.*", "coords="+pos);
            }
        });

        $(window).mousedown(function(e){
            if (e.which === 1 && e.target.id.indexOf("entity_") >= 0){
                fp_grabbed_entity = e.target;
                e.stopPropagation();
                return true;
            }
        });

        $(window).mouseup(function(e){
            if (fp_grabbed_entity === null)
                return;

            set_set_coordinates_from_offset(fp_grabbed_entity.id);
            fp_reposition_entities();
            fp_grabbed_entity = null;
        });

    }

    var set_set_coordinates_from_offset = function (id)
    {
        var E = $('#'+id);
        var offsetE = E.offset();
        offsetE.top += E.width()/2;
        offsetE.left += E.width()/2;
        var offsetP = $("#fp_graphic").offset();
        var width = fp_display_width;
        var hight = fp_display_height;
        var onePercentWidthInPx = width/100;
        var onePercentHeightInPx = hight/100;

        var newy =  (offsetE.top - offsetP.top) / onePercentHeightInPx;
        var newx =  (offsetE.left - offsetP.left) / onePercentWidthInPx;
        var coords = newy+"x"+newx;
        var name = id.match(/entity_(.*)_(\d)+$/)[1];
        var codeLines = $("#fp_pos_perl_code").text().split('\n');
        var newCode = "";
        if (fp_is_point_on_fp(offsetE) === false){
            E.attr("class", "entity="+id+" floorplan_item coords=");
            E.attr("src", "/ia7/graphics/fp_unknown_info_48.png");
            for (var i = 0; i< codeLines.length; i++)
            {
                var line = codeLines[i];
                if (line.startsWith("$"+name) === false && line !== "")
                {
                    newCode += line + "\n";
                }
            }
        }
        else{
            E.attr("class", "entity="+id+" floorplan_item coords="+coords);
            var coordIdx = id.match(/entity_(.*)_(\d)+$/)[2];

            var itemUpdated = false;
            for (var i = 0; i< codeLines.length; i++)
            {
                var line = codeLines[i];
                if (line.startsWith("$"+name+"->set_fp_location"))
                {
                    var m = line.match(/.*\((.*)\).*/);
                    oldCoords = m[1].split(",");
                    oldCoords[+coordIdx] = newy;
                    oldCoords[+coordIdx+1] = newx;
                    var newline = "$" + name + "->set_fp_location("+ oldCoords.join(",") + ");\n";
                    newCode += newline;
                    itemUpdated = true;
                }
                else if (line !== "")
                {
                    newCode += line + "\n";
                }
            }
            if (itemUpdated === false)
            {
                var newline = "$" + name + "->set_fp_location("+ newy +","+ newx + ");\n";
                newCode += newline;
            }
        }
        newCode = newCode.split('\n').sort().join('\n');
        $("#fp_pos_perl_code").text(newCode);
    };

    // reposition on window size change
    window.onresize = function(){
        if ($('#floorplan').length === 0)
        {
            window.onresize = null;
            return;
        }

        console.log("FP: window resized");
        fp_resize_floorplan_image();
        fp_reposition_entities();
    };

    var path_str = "/objects";
    var fields = "fields=fp_location,state,states,fp_icons,fp_icon_set,img,link,label,type";
    if (json_store.ia7_config.prefs.state_log_show === "yes")
        fields += ",state_log";

    var arg_str = "parents="+group+"&"+fields+"&long_poll=true&time="+time;

    updateSocket = $.ajax({
        type: "GET",
        url: "/LONG_POLL?json('GET','"+path_str+"','"+arg_str+"')",
        dataType: "json",
        error: function(xhr, textStatus, errorThrown){
            //   console.log('FP: request failed: "' + textStatus + '" "'+JSON.stringify(errorThrown, undefined,2)+'"');
        },
        success: function( json, statusText, jqXHR ) {
            //  console.log('FP: request succeeded: "' + statusText + '" "'+JSON.stringify(jqXHR, undefined,2)+'"');
            var requestTime = time;
            if (jqXHR.status === 200) {
                var t0 = performance.now();
                JSONStore(json);
                for (var entity in json.data) {
                    if (URLHash.show_pos && requestTime === 0){
                        perl_pos_coords = "";
                    }
                    for (var i=0 ; i < json.data[entity].fp_location.length-1; i=i+2){ //allow for multiple graphics
                        var popover = 0;
                        if ((json.data[entity].type === "FPCamera_Item") || (json_store.ia7_config.prefs.fp_state_popovers === "yes"))
                            popover = 1;

                        if (URLHash.show_pos && requestTime === 0){
                            if (perl_pos_coords.length !== 0){
                                perl_pos_coords += ", ";
                            }
                            perl_pos_coords += "" + json.data[entity].fp_location[i]+','+json.data[entity].fp_location[i+1];
                        }

                        var coords= json.data[entity].fp_location[i]+'x'+json.data[entity].fp_location[i+1];
                        var E = fp_getOrCreateIcon(json, entity, i, coords, URLHash.show_pos);

                        if (URLHash.show_pos === undefined)
                        {
                            // create unique popovers for Camera items
                            if (json.data[entity].type === "FPCamera_Item") {
                                var name = entity;
                                if (json.data[entity].label !== undefined)
                                    name = json.data[entity].label;

                                var a_start = "";
                                var a_end = "";
                                if (json.data[entity].link !== undefined) {
                                    a_start = '<a href="'+json.data[entity].link+'">';
                                    a_end = '</a>';
                                }

                                $('[data-toggle="popover"]').popover({
                                    placement : 'auto bottom', //placement of the popover. also can use top, bottom, left or right
                                    title : name,
                                    html: 'true', //needed to show html of course
                                    content : '<div id="popOverBox">'+a_start+'<img src="'+json.data[entity].img+'" width="251" height="201" />'+a_end+'</div>'
                                });
                            } else {
                                if (popover) {

                                    $('[data-toggle="popover"]').popover({
                                        placement : 'auto bottom', //placement of the popover. also can use top, bottom, left or right
                                        title : function() {
                                            var fp_entity = $(this).attr("id").match(/entity_(.*)_\d+$/)[1]; //strip out entity_ and ending _X ... item names can have underscores in them.
                                            var name = fp_entity;
                                            if (json_store.objects[fp_entity].label !== undefined) name = json_store.objects[fp_entity].label;
                                            var ackt = E.offset();
                                            return name+ " - "+json_store.objects[fp_entity].state;
                                        },
                                        html: 'true', //needed to show html of course
                                        content : function() {
                                            var fp_entity = $(this).attr("id").match(/entity_(.*)_\d+$/)[1]; //strip out entity_ and ending _X ... item names can have underscores in them.
                                            var po_states = json_store.objects[fp_entity].states;
                                            var html = '<div id="popOverBox">';
                                            // HP need to have at least 2 states to be a controllable object...
                                            if (po_states.length > 1) {
                                                html = '<div class="btn-group stategrp0 btn-block">';
                                                var buttons = 0;
                                                var stategrp = 0;
                                                for (var i = 0; i < po_states.length; i++){
                                                    if (filterSubstate(po_states[i]) !== 1) {
                                                        buttons++;
                                                        if (buttons > 2) {
                                                            stategrp++;
                                                            html += "</div><div class='btn-group btn-block stategrp"+stategrp+"'>";
                                                            buttons = 1;
                                                        }

                                                        var color = getButtonColor(po_states[i]);
                                                        //TODO disabled override
                                                        var disabled = "";
                                                        if (po_states[i] === json_store.objects[fp_entity].state) {
                                                            disabled = "disabled";
                                                        }
                                                        html += "<button class='btn col-sm-6 col-xs-6 btn-"+color+" "+disabled+"'";
                                                        var url= '/SET;none?select_item='+fp_entity+'&select_state='+po_states[i];
                                                        html += ' onclick="$.get(';
                                                        html += "'"+url+"')";
                                                        html += '">'+po_states[i]+'</button>';
                                                    }
                                                }
                                                html += "</div></div>";
                                                //console.log("html="+html)
                                            }
                                            return html;
                                        }
                                    });
                                } else {
                                    E.click( function () {
                                        //var fp_entity = $(this).attr("id").split(/entity_/)[1]; //
                                        var fp_entity = $(this).attr("id").match(/entity_(.*)_\d+$/)[1]; //strip out entity_ and ending _X ... item names can have underscores in them.
                                        //alert("entity="+fp_entity);
                                        create_state_modal(fp_entity);
                                    });
                                }
                                E.mayTriggerLongClicks().on( 'longClick', function() {
                                    var fp_entity = $(this).attr("id").match(/entity_(.*)_\d+$/)[1]; //strip out entity_ and ending _X ... item names can have underscores in them.
                                    create_state_modal(fp_entity);
                                });
                            }
                        }
                    }

                    if (URLHash.show_pos && requestTime === 0){
                        if (perl_pos_coords.length===0)
                        {
                            fp_getOrCreateIcon(json, entity, 0, "", URLHash.show_pos);
                        }
                        else{
                            var oldCode = $('#fp_pos_perl_code').text();
                            if (oldCode.length !== 0)
                                oldCode += "\n";

                            var perl_pos_code = "";
                            var iconset = json.data[entity].fp_icon_set;
                            if (iconset !== undefined){
                                perl_pos_code += '$' + entity + '->set_fp_icon_set("';
                                perl_pos_code += iconset + '");\n';
                            }
                            perl_pos_code += "$" + entity + "->set_fp_location(";
                            perl_pos_code += perl_pos_coords + ");";
                            perl_pos_code = oldCode  + perl_pos_code;
                            perl_pos_code = perl_pos_code.split('\n').sort().join('\n');
                            $('#fp_pos_perl_code').text(perl_pos_code);
                        }
                    }
                }
                fp_reposition_entities();
                if (requestTime === 0 && URLHash.show_pos){
                    $('#list_content').append("<p>&nbsp;</p>");
                    $.ajax({
                        type: "GET",
                        url: "/LONG_POLL?json('GET','fp_icon_sets','px=48')",
                        dataType: "json",
                        error: function(xhr, textStatus, errorThrown){
                            console.log('FP: request iconsets failed: "' + textStatus + '" "'+JSON.stringify(errorThrown, undefined,2)+'"');
                        },
                        success: function( json, statusText, jqXHR ) {
                            console.log('FP: request iconsets: "' + statusText + '" "'+JSON.stringify(jqXHR, undefined,2)+'"');
                            var requestTime = time;
                            if (jqXHR.status === 200) {
                                var iconlist = '<ul class="icon_select" style="display:none;z-index:1000;position:absolute;overflow:hidden;border:1px solid #CCC; background: #FFF; border-radius: 5px; padding: 0;">\n';
                                var pathlist = jqXHR.responseJSON.data;
                                for (var i = 0; i < pathlist.length; i++){
                                    var path = pathlist[i];
                                    iconlist += "<il  style='float:left;padding:1px;cursor:pointer;list-style-type:none;transition:all .3s ease;'>";
                                    iconlist += "<img src='"+path+"' size='"+fp_scale+"%'/></il>\n";
                                }
                                iconlist += "<il  style='float:left;padding:1px;cursor:pointer;list-style-type:none;transition:all .3s ease;'>";
                                iconlist += "</ul>\n";
                                $('#list_content').append(iconlist);

                                // Trigger action when the contexmenu is about to be shown
                                $(".floorplan_item").bind("contextmenu", function (event) {

                                    event.preventDefault();

                                    fp_icon_select_item_id = $(this).attr('id');
                                    $(".icon_select").finish().toggle(100);
                                    $(".icon_select").offset({
                                        top: event.pageY,
                                        left: event.pageX
                                    });
                                });


                                // If the document is clicked somewhere
                                $(document).bind("mousedown", function (e) {
                                    if ($(e.target).parents(".icon_select").length === 0) {
                                        $(".icon_select").hide(100);
                                        fp_icon_select_item_id = null;
                                    }
                                });


                                // If the menu element is clicked
                                $(".icon_select img").click(function(){
                                    var img = $(this).attr("src");
                                    $('#'+fp_icon_select_item_id).attr('src', img);
                                    var name = fp_icon_select_item_id.match(/entity_(.*)_(\d)+$/)[1];

                                    var codeLines = $("#fp_pos_perl_code").text().split('\n');
                                    var newCode = "";

                                    var icon_set_name = img.match(/.*fp_(.*)_(.*)_48.png/)[1];
                                    var itemUpdated = false;
                                    for (var i = 0; i< codeLines.length; i++)
                                    {
                                        var line = codeLines[i];
                                        if (line.startsWith("$"+name+"->set_fp_icon_set"))
                                        {
                                            var newline = "$" + name + '->set_fp_icon_set("'+ icon_set_name+ '");\n';
                                            newCode += newline;
                                            itemUpdated = true;
                                        }
                                        else if (line !== "")
                                        {
                                            newCode += line + "\n";
                                        }
                                    }
                                    if (itemUpdated === false)
                                    {
                                        var newline = "$" + name + '->set_fp_icon_set("'+ icon_set_name +'");\n';
                                        newCode += newline;
                                    }
                                    newCode = newCode.split('\n').sort().join('\n');
                                    $("#fp_pos_perl_code").text(newCode);
                                    $(".icon_select").hide(100);
                                    fp_icon_select_item_id = null;
                                });
                            }
                        }
                    });
                }
                requestTime = json.meta.time;
                var t1 = performance.now();
                console.log("FP: long poll " +Math.round(t1 - t0) + "ms");
            }
            if (jqXHR.status === 200 || jqXHR.status === 204) {
                //Call update again, if page is still here
                //KRK best way to handle this is likely to check the URL hash
                if ($('#floorplan').length !== 0){
                    //If the floorplan page is still active request more data
                    // and we are not editing the fp
                    if (URLHash.show_pos ===  undefined)
                        floorplan(group,requestTime);
                }
            }
        }
    });
};


var get_fp_image = function(item,size,orientation) {
  	var image_name;
  	var image_color = getButtonColor(item.state);
	var baseimg_width = $(window).width();
  	var image_size = "48";
  //	if (baseimg_width < 500) image_size = "32" // iphone scaling
  	//kvar image_size = "32"
 	if (item.fp_icons !== undefined) {
 		//alert("Has a button defined state="+item.fp_icons[item.state]);
 		if (item.fp_icons[item.state] !== undefined) return item.fp_icons[item.state];
 	}
 	if (item.fp_icon_set !== undefined) {
 		//alert("Has a button defined state="+item.fp_icons[item.state]);
  		return "fp_"+item.fp_icon_set+"_"+image_color+"_"+image_size+".png";
 	} 	
 	//	if item.fp_icons.return item.fp_icons[state];
  	if(item.type === "Light_Item" || item.type === "Fan_Light" ||
    		item.type === "Insteon_Device" || item.type === "UPB_Link" ||
    		item.type === "Insteon::SwitchLinc" || item.type === "Insteon::SwitchLincRelay" ||    
    		item.type === "Insteon::KeyPadLinc" ||   		    				
    		item.type === "EIB_Item" || item.type === "EIB1_Item" ||
    		item.type === "EIB2_Item" || item.type === "EIO_Item" ||
    		item.type === "UIO_Item" || item.type === "X10_Item" ||    		
    		item.type === "xPL_Plugwise" || item.type === "X10_Appliance") {

  			return "fp_light_"+image_color+"_"+image_size+".png";
  	}
  	
  	if(item.type === "Motion_Item" || item.type === "X10_Sensor" ||
    		item.type === "Insteon::MotionSensor" ) {
  			return "fp_motion_"+image_color+"_"+image_size+".png";

  	}
  	
  	if(item.type === "Door_Item" || item.type === "Insteon::IOLinc_door") {
  			return "fp_door_"+image_color+"_"+image_size+".png";

  	}  	

  	if(item.type === "FPCamera_Item" ) {
 			return "fp_camera_default_"+image_size+".png";
 		}
  	
  	return "fp_unknown_info_"+image_size+".png";
};

var create_img_popover = function(entity) {
}

var create_state_popover = function(entity) {
}

var create_state_modal = function(entity) {
		var name = entity;
		if (json_store.objects[entity].label !== undefined) name = json_store.objects[entity].label;
		$('#control').modal('show');
		var modal_state = json_store.objects[entity].state;
		$('#control').find('.object-title').html(name + " - " + json_store.objects[entity].state);
		$('#control').find('.control-dialog').attr("entity", entity);
		var modal_states = json_store.objects[entity].states;
		// HP need to have at least 2 states to be a controllable object...
		if (modal_states == undefined) modal_states = 1;
		if (modal_states.length > 1) {
			$('#control').find('.states').html('<div class="btn-group stategrp0 btn-block"></div>');
			var modal_states = json_store.objects[entity].states;
			var buttonlength = 0;
			var stategrp = 0;
			var advanced_html = "";
			var display_buttons = 0;
			var grid_buttons = 3;
			var group_buttons = 4;
			// get number of displayed buttons so we can display nicely.
			for (var i = 0; i < modal_states.length; i++){
				if (filterSubstate(modal_states[i]) !== 1) display_buttons++
			}
			if (display_buttons == 2) {
				grid_buttons = 6;
				group_buttons = 2;
			}
			if (display_buttons % 3 == 0) {
				grid_buttons = 4;
				group_buttons = 3;
			}
			//console.log("display buttons="+display_buttons+" grid_buttons="+grid_buttons+" group_buttons="+group_buttons); 
			
			for (var i = 0; i < modal_states.length; i++){
				if (filterSubstate(modal_states[i]) == 1) {
				advanced_html += "<button class='btn btn-default col-sm-"+grid_buttons+" col-xs-"+grid_buttons+" hidden'>"+modal_states[i]+"</button>";
				continue 
			} else {
				//buttonlength += 2 + modal_states[i].length 
				buttonlength ++;
			}
			//if (buttonlength >= 25) {
			if (buttonlength > group_buttons) {
				stategrp++;
				$('#control').find('.states').append("<div class='btn-group btn-block stategrp"+stategrp+"'></div>");
				buttonlength = 1;
			}
			var color = getButtonColor(modal_states[i])
			var disabled = ""
			if (modal_states[i] == json_store.objects[entity].state) {
				disabled = "disabled";
			}
			//global override
			if (json_store.ia7_config.prefs.disable_current_state !== undefined && json_store.ia7_config.prefs.disable_current_state == "no") {
            	disabled = "";
			}
			//per object override
			if (json_store.ia7_config.objects !== undefined && json_store.ia7_config.objects[entity] !== undefined) {
                if (json_store.ia7_config.objects[entity].disable_current_state !== undefined && json_store.ia7_config.objects[entity].disable_current_state == "yes") {
                                disabled = "disabled";
                } else {
                                disabled = "";
                }
			}
			$('#control').find('.states').find(".stategrp"+stategrp).append("<button class='btn col-sm-"+grid_buttons+" col-xs-"+grid_buttons+" btn-"+color+" "+disabled+"'>"+modal_states[i]+"</button>");
						
		}
		$('#control').find('.states').append("<div class='btn-group advanced btn-block'>"+advanced_html+"</div>");
		$('#control').find('.states').find('.btn').click(function (){
			url= '/SET;none?select_item='+$(this).parents('.control-dialog').attr("entity")+'&select_state='+$(this).text();
			$('#control').modal('hide');
			$.get( url);
		});
		} else {
			//remove states from anything that doesn't have more than 1 state
			$('#control').find('.states').find('.btn-group').remove();
		}
		if (json_store.ia7_config.prefs.state_log_show !== "no") {
			//state log show last 4 (separate out set_by as advanced) - keeps being added to each time it opens
			// could load all log items, and only unhide the last 4 -- maybe later
			$('#control').find('.modal-body').find('.obj_log').remove();

			$('#control').find('.modal-body').append("<div class='obj_log'><h4>Object Log</h4>");
			for (var i = 0; i < json_store.ia7_config.prefs.state_log_entries; i++) {
				if (json_store.objects[entity].state_log[i] == undefined) continue;
				var slog = json_store.objects[entity].state_log[i].split("set_by=");
				$('#control').find('.obj_log').append(slog[0]+"<span class='mh_set_by hidden'>set_by="+slog[1]+"</span><br>");
			}
		}		
		$('.mhstatemode').on('click', function(){
			$('#control').find('.states').find('.btn').removeClass('hidden');
			$('#control').find('.mh_set_by').removeClass('hidden');
		});
}	


//Outputs the list of triggers
var trigger = function() {
	$.ajax({
	type: "GET",
	url: "/json/triggers",
	dataType: "json",
	success: function( json ) {
		var keys = [];
		for (var key in json.triggers) {
			keys.push(key);
		}
		var row = 0;
		for (var i = (keys.length-1); i >= 0; i--){
			var name = keys[i];
			if (row === 0){
				$('#list_content').html('');
			}
			var dark_row = '';
			if (row % 2 == 1){
				dark_row = 'dark-row';
			}
			$('#list_content').append("<div id='row_a_" + row + "' class='row top-buffer'>");
			$('#row_a_'+row).append("<div id='content_a_" + row + "' class='col-sm-12 col-sm-offset-0 col-md-10 col-md-offset-1 col-lg-8 col-lg-offset-2'>");
			$('#content_a_'+row).append("<div class='col-sm-5 trigger "+dark_row+"'><b>Name: </b><a id='name_"+row+"'>" + name + "</a></div>");
			$('#content_a_'+row).append("<div class='col-sm-4 trigger "+dark_row+"'><b>Type: </b><a id='type_"+row+"'>" + json.triggers[keys[i]].type + "</a></div>");
			$('#content_a_'+row).append("<div class='col-sm-3 trigger "+dark_row+"'><b>Last Run:</b> " + json.triggers[keys[i]].triggered + "</div>");
			$('#list_content').append("<div id='row_b_" + row + "' class='row'>");
			$('#row_b_'+row).append("<div id='content_b_" + row + "' class='col-sm-12 col-sm-offset-0 col-md-10 col-md-offset-1 col-lg-8 col-lg-offset-2'>");
			$('#content_b_'+row).append("<div class='col-sm-5 trigger "+dark_row+"'><b>Trigger:</b> <a id='trigger_"+row+"'>" + json.triggers[keys[i]].trigger + "</a></div>");
			$('#content_b_'+row).append("<div class='col-sm-7 trigger "+dark_row+"'><b>Code:</b> <a id='code_"+row+"'>" + json.triggers[keys[i]].code + "</a></div>");
			$.fn.editable.defaults.mode = 'inline';
			$('#name_'+row).editable({
				type: 'text',
				pk: 1,
				url: '/post',
				title: 'Enter username'
			});
			$('#type_'+row).editable({
				type: 'select',
				pk: 1,
				url: '/post',
				title: 'Select Type',
				source: [{value: 1, text: "Disabled"}, {value: 2, text: "NoExpire"}]
			});
			$('#trigger_'+row).editable({
				type: 'text',
				pk: 1,
				url: '/post',
				title: 'Enter trigger'
			});
			$('#code_'+row).editable({
				type: 'text',
				pk: 1,
				url: '/post',
				title: 'Enter code'
			});
			row++;
		}
	}
	});
};

$(document).ready(function() {
	// Start
	changePage();
	//Watch for future changes in hash
	$(window).bind('hashchange', function() {
		changePage();
	});
	$("#mhstatus").click( function () {
		var link = json_store.collections[600].link;
		link = buildLink (link, "0,600");
	//    window.location.href = "/ia7/#path=/objects&parents=group1&_collection_key=0,1,17,$group1";
	    window.location.href = link;
	});
	updateItem("ia7_status");
	$("#toolButton").click( function () {
		var entity = $("#toolButton").attr('entity');
		$('#optionsModal').modal('show');
		$('#optionsModal').find('.object-title').html("Mr.House Options");
		$('#optionsModal').find('.options-dialog').attr("entity", "options");
		
		$('#optionsModal').find('.modal-body').html('<div class="btn-group btn-block" data-toggle="buttons"></div>');
		var simple_active = "active";
		var simple_checked = "checked";
		var advanced_active = "";
		var advanced_checked = ""
		if (display_mode == "advanced") {
			simple_active = "";
			simple_checked = "";
			advanced_active = "active";
			advanced_checked = "checked"
		}
		$('#optionsModal').find('.modal-body').find('.btn-group').append("<label class='btn btn-default mhmode col-xs-6 col-sm-6"+simple_active+"'><input type='radio' name='mhmode2' id='simple' autocomplete='off'"+simple_checked+">simple</label>");
		$('#optionsModal').find('.modal-body').find('.btn-group').append("<label class='btn btn-default mhmode col-xs-6 col-sm-6"+advanced_active+"'><input type='radio' name='mhmode2' id='advanced' autocomplete='off'"+advanced_checked+">advanced</label>");
		$('.mhmode').on('click', function(){
			display_mode = $(this).find('input').attr('id');	
			changePage();
  		});
		// parse the collection ID 500 and build a list of buttons
		var opt_collection_keys = 0;
		var opt_entity_html = "";
		var opt_entity_sort = json_store.collections[500].children;
		if (opt_entity_sort.length <= 0){
		opt_entity_html = "Childless Collection";
		} else {
		    for (var i = 0; i < opt_entity_sort.length; i++){
				var collection = opt_entity_sort[i];
				if (!(collection in json_store.collections)) continue;
				var link = json_store.collections[collection].link;
				var icon = json_store.collections[collection].icon;
				var name = json_store.collections[collection].name;
				if (json_store.collections[collection].iframe !== undefined) {
				   link = "/ia7/include/iframe.shtml?"+json_store.collections[collection].iframe;
				}
				var opt_next_collection_keys = opt_collection_keys + "," + opt_entity_sort[i];
				link = buildLink (link, opt_next_collection_keys);
				if (json_store.collections[collection].external !== undefined) {
					link = json_store.collections[collection].external;
				}
				opt_entity_html += "<a link-type='collection' href='"+link+"' class='btn btn-default btn-lg btn-block btn-list' role='button'><i class='fa "+icon+" fa-2x fa-fw'></i>"+name+"</a>";
			}
		}
		$('#optionsModal').find('.modal-body').append(opt_entity_html);						
		$('#optionsModal').find('.btn-list').click(function (){
			$('#optionsModal').modal('hide');
		});
	});
});

//
// LICENSE
//
// This program is free software; you can redistribute it and/or modify it under the terms of
//   the GNU General Public License as published by the Free Software Foundation; 
//   either version 2 of the License, or (at your option) any later version.
//
// This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY;
//   without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. 
//   See the GNU General Public License for more details.
// 
// You should have received a copy of the GNU General Public License along with this program;
//   if not, write to the Free Software Foundation, Inc., 51 Franklin Street, Fifth Floor, Boston, MA  02110-1301, USA.
//

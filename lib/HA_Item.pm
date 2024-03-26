# ------------------------------------------------------------------------------


=begin comment
    @@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@

    =head1 B<HA_Server>
    =head1 B<HA_Item>

    Dave Neudoerffer <dave@neudoerffer.com>

    =head2 SYNOPSIS

    A HomeAssistant (HA) Items module for Misterhouse.
    Uses HA web socket interface.


    =head2 DESCRIPTION

    Misterhouse items class for control of HomeAssistant Entities

    Processes the HomeAssistant entity states response on startup.

    HA web socket doc:  https://developers.home-assistant.io/docs/api/websocket/

File:
    HA_Item.pm

Description:
    This is a misterhouse style items interface for HomeAssistant entities

    Author(s):
    Dave Neudoerffer <dave@neudoerffer.com>

    HA Items (HA_Item.pm)
    --------------------------

    There are several HA entity types implemented in this module (see below).

    Each MH item can handle both commands and state messages to/from MQTT devices.

    There are two classes implemented in HA_Item.pm:

    HA_Server:
         - this class connects to and manages the connection to HomeAssistant server
	 - it uses a Socket_Item to manage the tcp/ip connection
	 - it uses perl module Protocol::WebSocket::Client to manage the websocket
	 - if the socket drops, reconnects will be attempted every 10s until connection successful
	 - sends a ping request every <keep_alive_timer> seconds -- default 10s
	 - this object requires a HomeAssistant Long Lived Access Token
	    - aquire in HomeAssistant UI
	    - go to your profile under your user name lower left corner
	    - create token
	    - *** Make sure you copy the whole thing
	 - sends entity state request on startup and processes states for all devices

    HA_Item
	- implements an MH item that is tied to a HA entity on the specified HA Server
	- state changes from HA are monitored and reflected in the mh item state
	- when the MH item is set locally, a state change is sent to HA
	    - state is not reflected locally until the state change is received back from HA
	- several HA Entity types are supported:
	    - light:  currently only brightness attribute implemented, no colour
	    - switch: on/off switch
	    - sensor, binary_sensor:
	        - can group multiple sensors into a single MH item -- populates $item->{attr} hash
		- use one or more patterns to match HA entity names, separated by |
		- currently only pattern supported is entity_prefix_* (text with a '*' at the end)
	    - climate:
	        - populates $thermostat->{attr} with thermostat attributes like setpoints, temperatures, mode, presets etc.
		- can specify the HA service for modifications
		    eg.  $thermostat->set("set_temperature:72")
		    eg   $thermostat->set("set_hvac_mode:heat")

    

    Discovery:
    ----------

    The HA_Server object will send out an HA entity state query on connection.
    The response is processed for all entities that have had a local MH item defined.

    There is a static function defined that will print_log all unhandled HA entities:
        HA_Server::list_unhandled_entities()



License:
    This free software is licensed under the terms of the GNU public license.

Usage:

    config parms:
        homeassistant_address=
	homeassistant_api_key=


    .mht file:

	# HA_SERVER,	obj name,	address,	keepalive, 	api_key   
	HA_SERVER,	ha_house,	10.3.1.20:8123, 10,		XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX

	#HA_ITEM,	object_name,		domain,		ha_entity,		ha_server,  systemlist,	    friendly_name
	HA_ITEM,	shed_counter_pots,	light,		shed_counter_pots,	ha_house
	HA_ITEM,	water,			switch,		house_water_socket,	ha_house
	HA_ITEM,	thermostat,		climate,	family_room_thermostat,	ha_house
	HA_ITEM,	ecowitt_weather,	sensor,		hp2551bu_pro_v1_7_6_*|ecowitt_cottage_weather_*, ha_house



    and misterhouse user code:

        require HA_Item;

	$ha_house = new HA_Server( 'ha_house', '10.2.1.20:8123', '10', 'xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx' );
	$ha_house = new HA_Server( 'ha_house' );  # address and api_key from .ini file

	$water = new HA_Item( 'switch', 'house_water_socket', $ha_house );

        #
	if( state_changed $water ) {
	    &print_log( "Bootroom light set " . $bootroom_switch->state_changed() );
	}

	#
	if( new_minute(10) ) {
	    # this will toggle the light by sending a HA message
	    $shed_counter_lights->set( 'toggle' );
	}

	# this will print_log all HA topics that have not been handled by a local MH HA_Item
	$ha_house->list_unhandled_topics();


Notes:
    @@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@

    References:
        https://developers.home-assistant.io/docs/api/rest
	https://developers.home-assistant.io/docs/api/websocket

    @@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@

    =head2 B<Notes:>

    This processing receives all events from HomeAssistant.  It is fairly efficient
    at weeding out the none relevant events.  I have not seen any network load caused
    by volume.  It is likely most efficient to have MH and HA running on the same machine.

    =head2 INHERITS

    B<NONE>

    =head2 METHODS

    =over

    =item B<UnDoc>

    =item B<ToDo>

    There are a number of things that need to be done.
    - the pattern needs to be made to be a regexp
    - may need a timeout if haven't received a pong in a certain time and force reconnect
    - support more HA entity domains


=cut

# ------------------------------------------------------------------------------
package HA_Server;

use warnings;
# use strict;

@HA_Server::ISA = ('Generic_Item');

use Protocol::WebSocket::Client;

use JSON qw( decode_json encode_json );   
use Encode qw(decode encode);

use Data::Dumper;

my %HA_Server_List;

sub log {
    my ($self, $str, $prefix) = @_;
    my $maxlength = 300;

    $prefix = $prefix || 'HASVR: ';
    $str = $str || '';
    while( length( $str ) > $maxlength ) {
	my $l = 0;
	my $i;
	for( $i=0; $i<length($str) && $l<$maxlength; ++$i,++$l ) {
	    if( substr( $str, $i, 1 ) eq "\n" ) {
		$l = 0;
	    }
	}
	print $prefix . substr($str,0,$i) . "\n";
	&main::print_log( $prefix . substr($str,0,$i) );
	$str = substr( $str, $i );
	$prefix = '....  ';
    }
    if( $str ) {
	print $prefix . $str . "\n";
	&main::print_log( $prefix . $str );
    }
}

sub debug {
    my( $self, $level, $str ) = @_;
    if( $main::Debug{hasvr} >= $level ) {
	$level = 'D' if $level == 0;
	$self->log( $str, "HASVR D$level: " );
    }
}

sub error {
    my ($self, $str, $level ) = @_;
    &HA_Server::log( $self, $str, "HASVR ERROR: " );
}

sub dump {
    my( $self, $obj ) = @_;
    $obj = $obj || $self;
    my $dumper = Data::Dumper->new( [$obj] );
    $dumper->Maxdepth( 2 );
    return $dumper->Dump();
}


# ------------------------------------------------------------------------------

=item C<new(ha_server, name, address, keep_alive_timer, api_key )>

    Creates a HA_Server object that captures the connection to a single HomeAssistant server.

    namd:		object name of the ha_server
    address:		tcp/ip address and port of the HA server
    keep_alive_timer:	how long between ping requests to HA server (default 10s)
    api_key:		long lived token obtained from HA server 

=cut

sub new {
    my ( $class, $name, $address, $keep_alive_timer, $api_key ) = @_;
    my $self;

    print "creating HA Server $name on $address\n";

    if( !defined $main::Debug{hasvr} ) {
	$main::Debug{hasvr} = 0;
	# $main::Debug{hasvr} = 2;
    }

    $address		= $address  || $::config_parms{homeassistant_address}	|| 'localhost:8123';
    $api_key		= $api_key  || $::config_parms{homeassistant_api_key};
    $keep_alive_timer	= $keep_alive_timer                                     || '10';
    $keep_alive_timer += 0;

    $self = {};

    bless $self, $class;

    $$self{state}		= 'off';
    $$self{said}		= '';
    $$self{state_now}		= 'off';

    $self->{ip_address}		= $address;
    $self->{keep_alive_timer}	= $keep_alive_timer;
    $self->{reconnect_timer}	= 10;
    $self->{next_id}		= 20;
    $self->{subscribe_id}	= 0;
    $self->{api_key}		= $api_key;

    $self->{next_ping}		= 0;
    $self->{got_ping_response}	= 1;
    $self->{ping_missed_count}	= 0;

    $self->{recon_timer}	= ::Timer::new();

    $self->{name} = $name;


    $self->log("Creating $name on $$self{ip_address}");


    $HA_Server_List{$self->{name}} = $self;

    &::MainLoop_pre_add_hook( \&HA_Server::check_for_data, 1 );

    $self->connect();
    return $self;
}


sub connect {
    my ($self) = @_;

    $self->{socket_item} = new Socket_Item( undef, undef, $self->{ip_address}, $self->{name}, 'tcp', 'raw' );

    if( !$self->{socket_item}->start() ) {
	$self->log( "Unable to connect socket to $self->{ip_address} ... trying again in $self->{reconnect_timer}s" );
        if ($self->{recon_timer}->inactive) {
	    $self->{recon_timer}->set($self->{reconnect_timer}, sub { &HA_Server::connect( $self ) });
	}
	return;
    } else {
	$self->log( "Connected to HomeAssistant server at $self->{ip_address}" );
    }

    my $ws_client = Protocol::WebSocket::Client->new(url => 'ws://' . $self->{ip_address} . '/api/websocket' );
    
    $ws_client->{ha_server} = $self;
    $self->{ws_client} = $ws_client;

    $ws_client->on(
	write => sub {
	    my ($client,$buf) = @_;
	    my $self = $client->{ha_server};
     
	    if( $self->{socket_item} ) {
		$self->{socket_item}->set( $buf );
	    }
	}
    );
    $ws_client->on(
	read => sub {
	    my ($client,$buf) = @_;
	    my $self = $client->{ha_server};
     
	    $self->ha_process_read( $buf );
	}
    );
    $ws_client->on(
	error => sub {
	    my ($client,$buf) = @_;
	    my $self = $client->{ha_server};
     
	    $self->error( "ha_server received error: $buf" );
	}
    );
    $ws_client->{frame_buffer}->{max_payload_size} = 200000;

    $self->{ws_client}->connect();
}

sub check_for_data {
    my $ha_data;

    foreach my $ha_server ( values %HA_Server_List ) {
	if( $ha_server->{socket_item} ) {
	    if( $ha_server->{socket_item}->active_now() ) {
		$ha_server->debug( 1, "Homeassistant server started" );
	    }
	    if( $ha_server->{socket_item}->inactive_now() ) {
		$ha_server->debug( 1, "Homeassistant server close" );
		$ha_server->disconnect();
		$ha_server->connect();
		next;
	    }
	}
	
	# Parses incoming data and on every frame calls on_read
	if( $ha_server->{socket_item}  and  $ha_data = $ha_server->{socket_item}->said() ) {
	    # print "Received data from home assistant:\n     $ha_data\n";
	    $ha_server->{ws_client}->read( $ha_data );
	}
	 
	if( &::new_second($ha_server->{keep_alive_time}) and  $ha_server->{ws_client} ) {
	    $ha_server->{ws_client}->write( '{"id":' . ++$ha_server->{next_id} . ', "type":"ping"}' );
	}
    }
}

sub ha_process_write {
    my ($self, $data) = @_;

    if( ref $data ) {
	$data = encode_json( $data );
    }
    if( !$self->{socket_item}->active() ) {
        return;
    }
    $self->debug( 1, "sending data to ha: $data" );
    $self->{ws_client}->write( $data );
}

sub ha_process_read {
    my ($self, $data) = @_;
    my $data_obj;
    my $json_text;

    # print "ha_server received: \n    ";
    # print $data . "\n";

    $json_text = encode( "UTF-8", $data );
    eval {$data_obj = JSON->new->utf8->decode( $json_text )};
    if( $@ ) {
	$self->error( "parsing json from homeassistant: $@  [$json_text]" );
	print "Error parsing json from homeassistant: $@\n";
	print "   [$json_text]\n";
	return;
    }
    if( !$data_obj ) {
	$self->error( "Unable to decode json: $data" );
	return;
    }
    if( $data_obj->{type} eq 'pong' ) {
	$self->debug( 1, "Received pong from HA" );
	return;
    } elsif( $data_obj->{type} eq 'event'  &&  $data_obj->{id} == $self->{subscribe_id} ) {
	$self->parse_data_to_obj( $data_obj->{event}->{data}->{new_state}, "hasvr" );
        return;
    } elsif( $data_obj->{type} eq 'auth_required' ) {
	my $auth_message = "{ \"type\": \"auth\", \"access_token\": \"$$self{api_key}\" }";
	$self->ha_process_write( $auth_message );
	return;
    } elsif( $data_obj->{type} eq 'auth_ok' ) {
	my $subscribe;
	$self->log( "Authenticated to HomeAssistant server" );
	$self->{subscribe_id} = ++$self->{next_id};
	$subscribe->{id} = $self->{subscribe_id};
	$subscribe->{type} = 'subscribe_events';
	$subscribe->{event_type} = 'state_changed';
        $self->ha_process_write( $subscribe );
	my $getstates;
	$self->{getstates_id} = ++$self->{next_id};
	$getstates->{id} = $self->{getstates_id};
	$getstates->{type} = 'get_states';
        $self->ha_process_write( $getstates );
	return;
    } elsif( $data_obj->{type} eq 'auth_invalid' ) {
	$self->error( "Authentication invalid: " . $self->dump($data_obj) );
    } elsif( $data_obj->{type} eq 'result' ) {
	if( $data_obj->{success} ) {
	    $self->debug( 1, "Received success on request $data_obj->{id}" );
	    if( $data_obj->{id} == $self->{getstates_id} ) {
		$self->process_entity_states( $data_obj );
	    }
	    return;
	} else {
	    $self->error( "Received FAILURE on request $data_obj->{id}: " . $self->dump( $data_obj ) );
	}
    }
}

sub parse_data_to_obj {
    my ( $self, $cmd, $p_setby ) = @_;
    my $handled = 0;

    $self->debug( 2, "Msg object: " . $self->dump( $cmd ) );

    my ($cmd_domain,$cmd_entity) = split( '\.', $cmd->{entity_id} );
    for my $obj ( @{ $self->{objects} } ) {
	if( $obj->{entity_prefixes} ) {
	    for my $prefix (@{$obj->{entity_prefixes}}) {
		if( $prefix eq substr($cmd_entity,0,length($prefix)) ) {
		    my $attr_name = substr($cmd_entity,length($prefix));
		    $obj->{attr}->{$attr_name} = $cmd->{state};
		    $self->debug( 1, "handled event for $obj->{object_name} -- attr $attr_name set to $cmd->{state}" );
		    # $obj->set( 'toggle', undef );
		    if( $p_setby eq "hasvr_init" ) {
			$obj->{ha_init} = 1;
		    }
		    $handled = 1;
		}
	    }
	} elsif( $cmd->{entity_id} eq $obj->{entity_id} ) {
	    $self->debug( 1, "handled event for $obj->{object_name} set to $cmd->{state}" );
	    $obj->set( $cmd, $p_setby );
	    if( $p_setby eq "hasvr_init" ) {
		$obj->{ha_init} = 1;
	    }
	    $handled = 1;
	}
    }
    if( !$handled ) {
	$self->debug( 1, "unhandled event $cmd->{entity_id} ($cmd->{state})" );
    }
    return $handled;
}

sub process_entity_states {
    my ( $self, $cmd ) = @_;

    # print "Entity states response: \n" . $self->dump( $cmd );
    foreach my $state_obj (@{$cmd->{result}}) {
	if( !$self->parse_data_to_obj( $state_obj, "hasvr_init" ) ) {
	    push @{ $$self{unhandled_entities} }, $state_obj->{entity_id};
	}
    }
    # check that all ha_item objects had an initial state
    for my $obj ( @{ $self->{objects} } ) {
	if( !$obj->{ha_init} ) {
	    $self->log( "no HomeAssistant initial state for HA_Item object $obj->{object_name} entity_id:$obj->{entity_id}" );
	}
    }
}

=item C<list_unhandled_entities ()>

    Lists entities from the HA server that have not been handled with local items.
    This is an easy way to determine what HA entities you may want to create local items form

=cut

sub list_unhandled_entities {
    foreach my $ha_server ( values %HA_Server_List ) {
	for my $entity_id ( @{ $ha_server->{unhandled_entities} } ) {
	    $ha_server->log( "unhandled HomeAssistant entity: $ha_server->{name}:${entity_id}" );
	}
    }
}

=item C<disconnect()>

    Disconnect the websocket connection from an HA_Server object to the Home Assistant server.

=cut

sub disconnect {
    my ($self) = @_;

    if( $self->{ws_client} ) {
	$self->{ws_client}->disconnect();
	delete $self->{ws_client};
    }
    if( $self->{socket_item}  &&  $self->{socket_item}->active() ) {
	$self->{socket_item}->stop();
    }
}
 

sub add {
    my ( $self, @p_objects ) = @_;

    my @l_objects;

    for my $l_object (@p_objects) {
        if ( $l_object->isa('Group_Item') ) {
            @l_objects = $$l_object{members};
            for my $obj (@l_objects) {
                $self->add($obj);
            }
        }
        else {
            $self->add_item($l_object);
        }
    }
}


sub add_item {
    my ( $self, $p_object ) = @_;

    push @{ $$self{objects} }, $p_object;

    return $p_object;
}

sub remove_all_items {
    my ($self) = @_;

    $self->log("remove_all_items()");
    delete $self->{objects};
}

sub add_item_if_not_present {
    my ( $self, $p_object ) = @_;

    if ( ref $$self{objects} ) {
        foreach ( @{ $$self{objects} } ) {
            if ( $_ eq $p_object ) {
                return 0;
            }
        }
    }
    $self->add_item($p_object);
    return 1;
}

sub remove_item {
    my ( $self, $p_object ) = @_;

    if ( ref $$self{objects} ) {
        for ( my $i = 0; $i < scalar( @{ $$self{objects} } ); $i++ ) {
            if ( $$self{objects}->[$i] eq $p_object ) {
                splice @{ $$self{objects} }, $i, 1;
                return 1;
            }
        }
    }
    return 0;
}
# -------------End of HA_Server-------------------------------------------------


package HA_Item;

use warnings;

@HA_Item::ISA = ('Generic_Item');

use JSON qw( decode_json encode_json );   

use Data::Dumper;

=item C<new(HA_Item, domain, entity, ha_server )>

    Creates a HA_Item object that mirrors domain.entity in the HomeAssistant server ha_server.

    domain:	the HA domain of the entity
    entity:	the HA entity name
    ha_server:	the HA_Server object connected to the Home Assistant server

=cut

sub new {
    my ($class, $domain, $entity, $ha_server ) = @_;
    my $self = new Generic_Item();
    bless $self, $class;

    if( !$ha_server ) {
	$self->error( "No homeassistant server set" );
	return;
    }
    $self->{ha_server} = $ha_server;
    $self->debug( 1, "New HA_Item ( $class, $domain, $entity )" );
    if( $domain eq 'switch' ) {
	$self->set_states( "off", "on" );
    } elsif( $domain eq 'light' ) {
	$self->set_states( "off", "20%", "40%", "50%", "60%", "80%", "on" );
    } elsif( $domain eq 'climate' ) {
	$self->{attr} = {};
    } elsif( $domain eq 'sensor'  ||  $domain eq 'binary_sensor' ) {
	$self->{attr} = {};
    } else {
	$self->error( "Invalid type for HA_Item -- '$domain'" );
	return;
    }
    $self->{domain} = $domain;
    my @prefixes = split( '\|', $entity );
    if( $#prefixes  ||  substr( $entity, length($entity)-1, 1 ) eq '*' ) {
	if( $#prefixes == 0 ) {
	    @prefixes = ($entity);
	}
	for my $prefix (@prefixes) {
	    if( substr( $prefix, length($prefix)-1, 1 ) eq '*' ) {
		$prefix = substr( $prefix, 0, length($prefix)-1 );
	    }
	    push @{$self->{entity_prefixes}}, $prefix;
	}
	$self->debug( 1, "${domain}.${entity} prefixes: " . join( '|', @{$self->{entity_prefixes}}) );
    }

    $self->{entity} = $entity;
    $self->{entity_id} = "${domain}.${entity}";

    $self->{ha_server}->add( $self );

    return $self;
}

sub log {
    my( $self, $str ) = @_;
    $self->{ha_server}->log( $str );
}

sub error {
    my( $self, $str ) = @_;
    $self->{ha_server}->error( $str );
}

sub debug {
    my( $self, $level, $str ) = @_;
    if( $self->debuglevel( $level, 'hasvr' ) ) {
	$self->{ha_server}->log( $str, "HASVR D$level: " );
    }
}

sub dump {
    my( $self, $obj ) = @_;
    $obj = $obj || $self;
    my $dumper = Data::Dumper->new( [$obj] );
    $dumper->Maxdepth( 2 );
    return $dumper->Dump();
}

=item C<set_object_debug( level )>

Turns on debugging for the object, sets debug level.

=cut

sub set_object_debug {
    my( $self, $level ) = @_;
    my $objname = lc $self->get_object_name();
    $level = 1 if !defined $level;
    $main::Debug{$objname} = $level;
}

=item C<set(setval, p_setby, p_response )>

    Sets the value of the HA_Item to setval -- p_setby and p_response standard MH parms.
    This will cause a state change to be sent to the HA entity mirrored by the item.
    Local state will not be changed until the state_change event is received back from the HA server.

=cut
sub set {
    my ( $self, $setval, $p_setby, $p_response ) = @_;

    $self->debug( 1, "$self->{object_name} set by $p_setby to: ". $self->dump($setval) );
    if( $p_setby =~ /hasvr*/ ) {
	# This is home assistant sending a state change via websocket
	# This state change may or may not have been initiated by us
	# This is sent as an object representing the json new_state
	my $new_state = $setval;
	if( $self->{domain} eq 'switch' ) {
	    $self->SUPER::set( $new_state->{state}, $p_setby, $p_response );
	} elsif( $self->{domain} eq 'light' ) {
	    my $level = $new_state->{state};
	    if( $new_state->{state} eq 'on' ){
		if( $new_state->{attributes}->{brightness} ) {
		    $level = $new_state->{attributes}->{brightness} * 100 / 255;
		}
	    }
	    $self->SUPER::set( $level, $p_setby, $p_response );
	} elsif( $self->{domain} eq 'sensor'  ||  $self->{domain} eq 'binary_sensor' ) {
	    $self->SUPER::set( $new_state->{state}, $p_setby, $p_response );
	} elsif( $self->{domain} eq 'climate' ) {
	    foreach my $attrname (keys %{$new_state->{attributes}} ) {
		$self->{attr}->{$attrname} = $new_state->{attributes}->{$attrname};
	    }
	    $self->debug( 1, "climate attributes set: " . $self->dump($self->{attr}) );
	    $self->SUPER::set( $new_state->{state}, $p_setby, $p_response );
	}
    } else {
	my $cmd;
	# Item has been set locally -- use HA WebSocket to change state
	if( $self->{domain} eq 'light'  ||  $self->{domain} eq 'switch' ) {
	    $cmd = $self->ha_rest_set_light( $setval );
	} elsif( $self->{domain} eq 'climate' ) {
	    $cmd = $self->ha_rest_set_therm( $setval );
	}
    
	if( !$cmd ) {
	    $self->error( "invalid domain type in set method ($self->{domain}" );
	} else {
	    $self->{ha_server}->ha_process_write( $cmd );
	}
    }
}


sub ha_rest_set_light {
    my ($self, $mode) = @_;
    my $ha_data = {};
    my $ha_rest_cmd;
    my $ha_data_text;
    my $cmd;

    $ha_data->{id} = ++$self->{ha_server}->{next_id};
    $ha_data->{type} = 'call_service';
    $ha_data->{domain} = $self->{domain};
    $ha_data->{target} = {};
    $ha_data->{target}->{entity_id} = $self->{entity_id};
    my ($numval) = $mode =~ /^([1-9]?[0-9]?[0-9])%?$/;
    if( $numval ) {
	$ha_data->{service} = 'turn_on';
	$ha_data->{service_data} = {};
	$ha_data->{service_data}->{brightness_pct} = $numval;
    } elsif( $mode eq 'on' ) {
	$ha_data->{service} = 'turn_on';
    } elsif( $mode eq 'toggle' ) {
	$ha_data->{service} = 'toggle';
    } else {
	$ha_data->{service} = 'turn_off';
    }
    return( $ha_data );
}

sub ha_rest_set_therm {
    my ($self, $setval) = @_;
    my $ha_data = {};
    my $cmd;

    # valid services are:  temperature, fan_mode, hvac_mode, aux_heat
    my ($service,$value) = split( ':', $setval );
    if( !defined $service || !defined $value ) {
	$service = $setval;
    }
    my ($service_name) = $service =~ /set_(.*)/;
    if( $service =~ /set_.*/  &&  !defined $value ) {
	$self->error( "Invalid set value for object $self->{object_name} -- form <service>:<value>" );
	return;
    }
    $ha_data->{id} = ++$self->{ha_server}->{next_id};
    $ha_data->{type} = 'call_service';
    $ha_data->{domain} = $self->{domain};
    $ha_data->{target} = {};
    $ha_data->{target}->{entity_id} = $self->{entity_id};
    $ha_data->{service_data} = {};
    $ha_data->{service} = "${service}";
    if( defined $value ) {
	$ha_data->{service_data}->{$service_name} = $value;
    }
    return $ha_data;
}

=item C<is_dimmable()>

Returns whether object is dimmable.

=cut

sub is_dimmable {
    my ( $self ) = @_;
    if( $self->{mqtt_type} eq 'light' ) {
	return 1;
    }
    return 0;
}

# -[ Fini - HA_Item ]---------------------------------------------------------

1;

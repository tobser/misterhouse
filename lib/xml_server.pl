use strict;

#---------------------------------------------------------------------------
#  Generate xml for mh objects, groups, categories, and variables 
#---------------------------------------------------------------------------


			# This is bad because config_parms contains passwords 
#Password_Allow{'&xml'}		  = 'anyone';

# Called via the web server.  If no request, xml for all types is returned.  Examples:
#   http://localhost:8080/sub?xml
#   http://localhost:8080/sub?xml(vars)
# You can also specify which objects, groups, categories, variables, etc to return (by default, all) Example: 
#   http://me:8080/sub?xml(weather=TempIndoor|TempOutdoor)
# You can also specify which fields of objects are returned (by default, all) Example: 
#   http://localhost:8080/sub?xml(groups=$All_Lights,fields=html)

# TODO 
# The = operator isn't supported on all data types 
# There should be a usage data type that gives clickable examples 
# There should be a way to override the default xsl file 

use HTML::Entities; # So we can encode characters like <>& etc
 
sub xml {		
	my ($request, $options) = @_;
	my ($xml, $xml_types, $xml_groups, $xml_categories, $xml_widgets, $xml_vars, $xml_objects);

	$request = 'types,groups,categories,widgets,config_parms,weather,save,vars,objects' unless $request;
	my %request;
	foreach (split ',', $request) {
		my ($k, undef, $v) = /(\w+)(=([\w\|\$]+))?/;
		$request{$k}{active} = 1;
		$request{$k}{members} = [ split /\|/, $v ] if $k and $v;
	}
	  
	my %options;
	foreach (split ',', $options) {
		my ($k, undef, $v) = /(\w+)(=([\w\|\_]+))?/;
		$options{$k}{active} = 1;
		$options{$k}{members} = [ split /\|/, $v ] if $k and $v;
	}
	  
	my %fields; 
	if (exists $options{fields}{members}) {
		foreach (@{ $options{fields}{members} }) {
			$fields{$_} = 1;
		}
	}

			# List objects by type
	if ($request{types}) {
		$xml .= "\t<types>\n";
		for my $object_type (sort @Object_Types) {
			next if exists $request{types}{members} and (not grep {$_ eq $object_type} @{ $request{types}{members} });
			$xml .= "\t\t<type>\n\t\t\t<name>$object_type</name>\n";
			foreach (sort &list_objects_by_type($object_type)) {	
				$_ = &get_object_by_name($_);
				$xml .= &object_detail($_, %fields);
			}
			$xml .= "\t\t</type>\n";
		}
		$xml .= "\t</types>\n";
	}

			# List objects by groups
	if ($request{groups}) {
		$xml .= "\t<groups>\n";
		for my $group (sort &list_objects_by_type('Group')) {
			next if exists $request{groups}{members} and (not grep {$_ eq $group} @{ $request{groups}{members} });
			my $group_object = &get_object_by_name($group);
			$xml .= "\t\t<group>\n\t\t\t<name>$group</name>\n";
			foreach (list $group_object) {
				$xml .= &object_detail($_, %fields);
			}
			$xml .= "\t\t</group>\n";
		}
		$xml .= "\t</groups>\n";
	}

			# List voice commands by category
	if ($request{categories}){
		$xml .= "\t<categories>\n";
		for my $category (&list_code_webnames('Voice_Cmd')) {
			next if $category =~ /^none$/;
			next if exists $request{categories}{members} and (not grep {$_ eq $category} @{ $request{categories}{members} });
			$xml .= "\t\t<category>\n\t\t\t<name>$category</name>\n";
			foreach (sort &list_objects_by_webname($category)) {
				$_ = &get_object_by_name($_);
				$xml .= &object_detail($_, %fields);
			}
			$xml .= "\t\t</category>\n";
		}
		$xml .= "\t</categories>\n";
	}		

			# List objects
	if ($request{objects}) {
		for my $object_type (@Object_Types) {
			$xml_objects .= "  <object_type>\n	<name>$object_type</name>\n";
			if (my @object_list = sort &list_objects_by_type($object_type)) {
		for my $object (map{&get_object_by_name($_)} @object_list) {
					next if $object->{hidden};
					$xml_objects .= &object_detail($object, %fields);
				}
			}
			$xml_objects .= "  </object_type>\n";
		}
		$xml .= "<objects>\n$xml_objects</objects>\n";
	}

			# List widgets
	if ($request{widgets}) {
		$xml .= "  <widgets>\n$xml_widgets\n  </widgets>\n";
	}

			# List Weather hash values 
	if ($request{weather}) {
		$xml .= "  <weather>\n";
		foreach my $key (sort keys %Weather) { 
			my $tkey = $key; 
			$tkey =~ s/ /_/g;
			$tkey =~ s/#//g;
			$xml .= "   <$tkey>" . $Weather{$key} . "</$tkey>\n";
		}
		$xml .= "  </weather>\n";
	}

			# List config_parms hash values 
	if ($request{config_parms}) {
		$xml .= "  <config_parms>\n";
		foreach my $key (sort keys %config_parms) { 
			my $tkey = $key; 
			$tkey =~ s/ /_/g;
			$tkey =~ s/#//g; 
			my $value = $config_parms{$key};
			$value = "<!\[CDATA\[\n$value\n\]\]>" if $value =~ /[<>&]/;
			$xml .= "   <$tkey>$value</$tkey>\n";
		}
		$xml .= "  </config_parms>\n";
	}

			# List Save hash values 
	if ($request{save}) {
		$xml .= "<  save>\n";
		foreach my $key (sort keys %Save) {
			my $tkey = $key; 
			$tkey =~ s/ /_/g;
			$tkey =~ s/#//g;
			$xml .= "   <$tkey>" . $Save{$key} . "</$tkey>\n";
		}
		$xml .= "  </save>\n";
	}
			# List Global vars
	if ($request{vars}) {
		for my $key (sort keys %main::) {
			# Assume all the global vars we care about are $Ab... 
			next if $key !~ /^[A-Z][a-z]/ or $key =~ /\:/;
			next if $key eq 'Save'; # Covered elsewhere
			next if $key eq 'Weather'; # Covered elsewhere
			next if $key eq 'Socket_Ports';
			no strict 'refs';
			if (defined $$key) {
				my $value = $$key;
				next if $value =~ /HASH/; # Skip object pointers
				$value = "<!\[CDATA\[\n$value\n\]\]>" if $value =~ /[<>&]/;
				$xml_vars .= "  <var>\$$key==$value</var>\n";
			} 
			elsif (defined %{$key}) {
				for my $key2 (sort eval "keys \%$key") {
					my $value = eval "\$$key\{'$key2'\}\n";
					$value = "<!\[CDATA\[\n$value\n\]\]>" if $value =~ /[<>&]/;
					$xml_vars .= "  <var>\$$key\{$key2\}=$value</var>\n";
				}				
			}
		}
		$xml .= "  <vars>\n$xml_vars  </vars>\n";
		} 

			# Translate special characters
	$xml = encode_entities($xml, "\200-\377&");
#   $xml =~ s/\+/\%2B/g; # Use hex 2B = +, as + will be translated to blanks
	
	$xml  = "<misterhouse>\n$xml</misterhouse>";
	return &xml_page($xml);
}

sub object_detail {
	my ($object, %fields) = @_;
	return if $fields{none};
	my $object_name = $object->{object_name};
	my $xml_objects  = "\t\t\t<object>\n";
	$xml_objects .= "\t\t\t\t<name>$object_name</name>\n";
	$xml_objects .= "\t\t\t\t<filename>$object->{filename}</file>\n" 			if $fields{all} or $fields{filename};
	$xml_objects .= "\t\t\t\t<category>$object->{category}</category>\n"		if $fields{all} or $fields{category};
	my $state = encode_entities($object->{state}, "\200-\377&<>");
	$xml_objects .= "\t\t\t\t<state>$state</state>\n"					if $fields{all} or $fields{state};
#	$xml_objects .= "\t\t\t\t<set_by>" . $object->get_set_by . "</set_by>\n" if defined &$object->get_set_by;
	$xml_objects .= "\t\t\t\t<type>$object->{get_type}</type>\n"			if $fields{all} or $fields{type};
	$xml_objects .= "\t\t\t\t<states>@{$object->{states}}</states>\n"			if $fields{all} or $fields{states};
	$xml_objects .= "\t\t\t\t<text>$object->{text}</text>\n"				if $fields{all} or $fields{text};
	$xml_objects .= "\t\t\t\t<html><!\[CDATA\[" . &html_item_state($object, $object->{get_type}) . "\]\]>\n\t\t\t\t</html>\n"
														if $fields{all} or $fields{html};
	if ($object->{get_type} eq 'Timer') {
		$xml_objects .= "\t\t\t\t<seconds_remaining>" . $object->seconds_remaining . "</seconds_remaining>\n";
	}
	$xml_objects .= "\t\t\t</object>\n";
	return $xml_objects; 
}

sub xml_page {
	my ($xml) = @_;

#<!DOCTYPE document SYSTEM "misterhouse.dtd">
#<?xml version="1.0" standalone="no" ?>

	return <<eof;
HTTP/1.0 200 OK
Server: MisterHouse
Content-type: text/xml

<?xml version="1.0" encoding="utf-8" standalone="yes"?>
<?xml-stylesheet type="text/xsl" href="/default.xsl"?>
$xml

eof

}

sub xml_entities_encode { 
	my $s = shift; 
	$s =~ s/\&/&amp;/g;
	$s =~ s/\</&lt;/g;
	$s =~ s/\>/&gt;/g;
	$s =~ s/\'/&apos;/g;
	$s =~ s/\"/&quot;/g;
	return $s;
}

sub svg_page {
	my ($svg) = @_;
	return <<eof;
HTTP/1.0 200 OK
Server: Homegrow
Content-type: image/svg+xml

$svg
eof

}

return 1;		   # Make require happy

#
# $Log: xml_server.pl,v $
# Revision 1.2  2004/09/25 20:01:20  winter
# *** empty log message ***
#
# Revision 1.1  2001/05/28 21:22:46  winter
# - 2.52 release
#
#
